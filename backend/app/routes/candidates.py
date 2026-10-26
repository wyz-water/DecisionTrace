import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.discussion import Discussion
from app.models.decision import Decision
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.models.candidate import Candidate
from app.schemas.candidate import (
    CandidateResponse,
    CandidateUpdate,
    CandidateReject,
    CandidateConfirmResponse,
    ExtractResponse,
)
from app.services.extractor import extract_candidates, serialize_candidate
from app.statuses import COMMITMENT_STATUSES, DECISION_STATUSES


router = APIRouter(
    prefix="/candidates",
    tags=["Candidates"]
)


@router.post(
    "/extract/{discussion_id}",
    response_model=ExtractResponse
)
def extract_from_discussion(
    discussion_id: int,
    db: Session = Depends(get_db)
):
    discussion = db.query(Discussion).filter(
        Discussion.id == discussion_id
    ).first()

    if not discussion:
        raise HTTPException(
            status_code=404,
            detail="Discussion not found"
        )

    candidates = extract_candidates(discussion.content)

    existing = db.query(Candidate).filter(
        Candidate.discussion_id == discussion.id,
        Candidate.status == "PENDING"
    ).all()

    existing_keys = {
        (
            item.candidate_type,
            json.dumps(json.loads(item.payload), sort_keys=True)
        )
        for item in existing
    }

    created = []

    for item in candidates:
        key = (
            item["candidate_type"],
            json.dumps(item["payload"], sort_keys=True)
        )

        if key in existing_keys:
            continue
        candidate = Candidate(
            project_id=discussion.project_id,
            discussion_id=discussion.id,
            candidate_type=item["candidate_type"],
            payload=json.dumps(item["payload"]),
            source_text=item.get("source_text"),
            status="PENDING"
        )

        db.add(candidate)
        created.append(candidate)

    db.commit()

    for candidate in created:
        db.refresh(candidate)

    return {
        "discussion_id": discussion.id,
        "created": len(created),
        "candidates": [serialize_candidate(c) for c in created],
    }


@router.get(
    "",
    response_model=list[CandidateResponse]
)
def get_candidates(
    project_id: int | None = None,
    discussion_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(Candidate)

    if project_id is not None:
        query = query.filter(Candidate.project_id == project_id)

    if discussion_id is not None:
        query = query.filter(Candidate.discussion_id == discussion_id)

    if status is not None:
        query = query.filter(Candidate.status == status.upper())

    return [
        serialize_candidate(candidate)
        for candidate in query.order_by(Candidate.created_at.desc()).all()
    ]


@router.patch(
    "/{candidate_id}",
    response_model=CandidateResponse
)
def update_candidate(
    candidate_id: int,
    update: CandidateUpdate,
    db: Session = Depends(get_db)
):
    candidate = db.query(Candidate).filter(
        Candidate.id == candidate_id
    ).first()

    if not candidate:
        raise HTTPException(
            status_code=404,
            detail="Candidate not found"
        )

    if candidate.status != "PENDING":
        raise HTTPException(
            status_code=400,
            detail="Only pending candidates can be edited"
        )

    if update.payload is not None:
        candidate.payload = json.dumps(update.payload)

    if update.review_comment is not None:
        candidate.review_comment = update.review_comment

    db.commit()
    db.refresh(candidate)

    return serialize_candidate(candidate)


def _field(payload, key):
    """Return the trimmed string value, or None when absent / not a
    string. Non-string values are treated as missing so confirmation
    fails cleanly instead of crashing."""
    value = payload.get(key)

    if not isinstance(value, str):
        return None

    value = value.strip()

    return value or None


def _find_commitments_by_owner(db, project_id, owner):
    return db.query(Commitment).filter(
        Commitment.project_id == project_id,
        func.lower(Commitment.owner) == owner.lower()
    ).all()


def _find_decision_by_title(db, project_id, title):
    return db.query(Decision).filter(
        Decision.project_id == project_id,
        func.lower(Decision.title) == title.lower()
    ).first()


def _normalize_status(value, allowed, default):
    """Uppercase and validate a status from a candidate payload."""
    if value is None:
        return default

    status = str(value).strip().upper()

    if status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{value}' in candidate payload"
        )

    return status


@router.post(
    "/{candidate_id}/confirm",
    response_model=CandidateConfirmResponse
)
def confirm_candidate(
    candidate_id: int,
    db: Session = Depends(get_db)
):
    candidate = db.query(Candidate).filter(
        Candidate.id == candidate_id
    ).first()

    if not candidate:
        raise HTTPException(
            status_code=404,
            detail="Candidate not found"
        )

    if candidate.status != "PENDING":
        raise HTTPException(
            status_code=400,
            detail="Only pending candidates can be confirmed"
        )

    payload = json.loads(candidate.payload)

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="Candidate payload must be a JSON object"
        )

    if candidate.candidate_type == "DECISION":
        title = _field(payload, "title")

        if not title:
            raise HTTPException(
                status_code=400,
                detail="Decision candidate is missing a title"
            )

        status = _normalize_status(
            payload.get("status"), DECISION_STATUSES, "CONFIRMED"
        )

        record = Decision(
            project_id=candidate.project_id,
            source_discussion_id=candidate.discussion_id,
            title=title,
            rationale=_field(payload, "rationale"),
            status=status
        )

    elif candidate.candidate_type == "COMMITMENT":
        owner = _field(payload, "owner")
        description = _field(payload, "description")

        if not owner or not description:
            raise HTTPException(
                status_code=400,
                detail="Commitment candidate is missing owner or description"
            )

        decision_id = None

        decision_title = _field(payload, "decision_title")
        if decision_title:
            decision = _find_decision_by_title(
                db, candidate.project_id, decision_title
            )

            if not decision:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Decision '{decision_title}' not found in this "
                        "project — fix or clear the linked decision"
                    )
                )

            decision_id = decision.id

        due_date = None
        due_date_value = _field(payload, "due_date")
        if due_date_value:
            try:
                due_date = date.fromisoformat(due_date_value)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Invalid due date '{due_date_value}' — "
                        "use YYYY-MM-DD"
                    )
                )

        status = _normalize_status(
            payload.get("status"), COMMITMENT_STATUSES, "OPEN"
        )

        record = Commitment(
            project_id=candidate.project_id,
            decision_id=decision_id,
            owner=owner,
            description=description,
            due_date=due_date,
            status=status
        )

    elif candidate.candidate_type == "DEPENDENCY":
        predecessor_owner = _field(payload, "predecessor_owner")
        successor_owner = _field(payload, "successor_owner")

        if not predecessor_owner or not successor_owner:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Dependency candidate is missing predecessor_owner "
                    "or successor_owner"
                )
            )

        predecessors = _find_commitments_by_owner(
            db, candidate.project_id, predecessor_owner
        )

        if not predecessors:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Predecessor commitment '{predecessor_owner}' "
                    "not found in this project"
                )
            )

        if len(predecessors) > 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Multiple commitments owned by '{predecessor_owner}' — "
                    "rename owners so they are unique, then retry"
                )
            )

        successors = _find_commitments_by_owner(
            db, candidate.project_id, successor_owner
        )

        if not successors:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Successor commitment '{successor_owner}' "
                    "not found in this project"
                )
            )

        if len(successors) > 1:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Multiple commitments owned by '{successor_owner}' — "
                    "rename owners so they are unique, then retry"
                )
            )

        predecessor = predecessors[0]
        successor = successors[0]

        if predecessor.id == successor.id:
            raise HTTPException(
                status_code=400,
                detail="A commitment cannot depend on itself"
            )

        record = Dependency(
            project_id=candidate.project_id,
            predecessor_commitment_id=predecessor.id,
            successor_commitment_id=successor.id,
            dependency_type=_field(payload, "dependency_type") or "BLOCKS"
        )

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown candidate type: {candidate.candidate_type}"
        )

    db.add(record)

    candidate.status = "CONFIRMED"

    db.commit()
    db.refresh(record)
    db.refresh(candidate)

    return {
        "candidate_id": candidate.id,
        "created_id": record.id,
        "candidate": serialize_candidate(candidate),
    }


@router.post(
    "/{candidate_id}/reject",
    response_model=CandidateResponse
)
def reject_candidate(
    candidate_id: int,
    reject: CandidateReject,
    db: Session = Depends(get_db)
):
    candidate = db.query(Candidate).filter(
        Candidate.id == candidate_id
    ).first()

    if not candidate:
        raise HTTPException(
            status_code=404,
            detail="Candidate not found"
        )

    if candidate.status != "PENDING":
        raise HTTPException(
            status_code=400,
            detail="Only pending candidates can be rejected"
        )

    candidate.status = "REJECTED"
    candidate.review_comment = reject.comment

    db.commit()
    db.refresh(candidate)

    return serialize_candidate(candidate)
