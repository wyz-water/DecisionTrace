import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
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
    CandidateBatchConfirmRequest,
    CandidateBatchConfirmResponse,
    ExtractResponse,
)
from app.schemas.dependency import DependencyCreate
from app.schemas.page import Page
from app.routes.dependencies import cycle_rejection_payload
from app.services.extractor import (
    extract_candidates,
    serialize_candidate,
    summarize_discussion,
)
from app.services.graph import find_cycle_with_edge
from app.services.pagination import PageParams, page_response, paginate
from app.statuses import COMMITMENT_STATUSES, DECISION_STATUSES


router = APIRouter(
    prefix="/candidates",
    tags=["Candidates"]
)


_IDENTITY_FIELDS = {
    "DECISION": ("title",),
    "COMMITMENT": ("owner", "description"),
    "DEPENDENCY": ("predecessor_owner", "successor_owner"),
}


def _candidate_keys(candidate_type, payload, source_text):
    """Identity of one extracted record, used to make extraction repeatable.

    Two keys are returned because either one alone is enough to prove the
    record was already extracted:

    * the source sentence plus the record's identity fields. The sentence
      alone is not enough — one sentence can describe several facts
      ("Ann blocks Bob and Carol" yields two dependency candidates) — and
      the whole payload is too much, because the review UI can rewrite
      non-identity fields (status, dates, rationale) without turning the
      record into a different fact;
    * the canonical payload, which catches the same fact restated in a
      slightly different sentence.
    """
    keys = []

    expected = _IDENTITY_FIELDS.get(candidate_type, ())

    identity = tuple(
        payload.get(field)
        for field in expected
        if payload.get(field)
    )

    # A candidate whose identity fields are missing, or of a type this
    # server does not know, cannot be told apart from its sentence: the
    # full payload is the only honest discriminator.
    discriminator = (
        identity
        if expected and len(identity) == len(expected)
        else json.dumps(payload, sort_keys=True)
    )

    if source_text:
        keys.append(
            (
                candidate_type,
                "text",
                " ".join(source_text.split()),
                discriminator,
            )
        )

    keys.append(
        (candidate_type, "payload", json.dumps(payload, sort_keys=True))
    )

    return keys


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

    # Re-extraction has to be idempotent. Comparing only against PENDING
    # rows meant that extracting again after a review recreated every
    # confirmed and rejected candidate as a fresh duplicate; a rejected
    # candidate must not come back either.
    existing = db.query(Candidate).filter(
        Candidate.discussion_id == discussion.id
    ).all()

    seen = set()

    for row in existing:
        seen.update(
            _candidate_keys(
                row.candidate_type,
                json.loads(row.payload),
                row.source_text
            )
        )

    created = []
    skipped = 0

    for item in candidates:
        keys = _candidate_keys(
            item["candidate_type"],
            item["payload"],
            item.get("source_text")
        )

        # Also covers duplicates inside one extraction run: the same
        # sentence pasted twice in a discussion yields the same key.
        if any(key in seen for key in keys):
            skipped += 1
            continue

        seen.update(keys)

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
        "skipped": skipped,
        "candidates": [_serialize_candidate(db, c) for c in created],
        "summary": summarize_discussion(discussion.content),
    }


@router.get(
    "",
    response_model=Page[CandidateResponse]
)
def get_candidates(
    project_id: int | None = None,
    discussion_id: int | None = None,
    status: str | None = None,
    page: PageParams = Depends(),
    db: Session = Depends(get_db)
):
    query = db.query(Candidate)

    if project_id is not None:
        query = query.filter(Candidate.project_id == project_id)

    if discussion_id is not None:
        query = query.filter(Candidate.discussion_id == discussion_id)

    if status is not None:
        # Comma separated so the review screen can ask for one queue in a
        # single request: `?status=CONFIRMED,REJECTED` is the "reviewed"
        # tab, `?status=PENDING` the "to review" tab.
        statuses = [
            value.strip().upper()
            for value in status.split(",")
            if value.strip()
        ]

        if statuses:
            query = query.filter(Candidate.status.in_(statuses))

    # Newest first, with id as a tiebreaker so equal timestamps cannot
    # produce an unstable order across pages.
    query = query.order_by(
        Candidate.created_at.desc(),
        Candidate.id.desc()
    )

    rows, total = paginate(query, page)

    return page_response(
        [_serialize_candidate(db, candidate) for candidate in rows],
        total,
        page
    )


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


def _duplicate_of(db, candidate):
    """Name the authoritative record this pending candidate repeats.

    Feedback point 1 (reduce manual burden): re-stating an existing fact
    in a meeting is the common case, so duplicates are detected against
    authoritative records (decisions, commitments, dependencies) — not
    against other candidates, which extraction keys already cover — and
    surfaced on the candidate itself. None when the candidate is new.
    """
    payload = json.loads(candidate.payload)

    if not isinstance(payload, dict):
        return None

    if candidate.candidate_type == "DECISION":
        title = _field(payload, "title")
        if title:
            existing = _find_decision_by_title(
                db, candidate.project_id, title
            )
            if existing:
                return f"Decision #{existing.id}"

    elif candidate.candidate_type == "COMMITMENT":
        owner = _field(payload, "owner")
        description = _field(payload, "description")
        if owner and description:
            match = db.query(Commitment).filter(
                Commitment.project_id == candidate.project_id,
                func.lower(Commitment.owner) == owner.lower(),
                func.lower(Commitment.description) == description.lower(),
            ).first()
            if match:
                return f"Commitment #{match.id}"

    elif candidate.candidate_type == "DEPENDENCY":
        predecessor_owner = _field(payload, "predecessor_owner")
        successor_owner = _field(payload, "successor_owner")
        if predecessor_owner and successor_owner:
            predecessors = _find_commitments_by_owner(
                db, candidate.project_id, predecessor_owner
            )
            successors = _find_commitments_by_owner(
                db, candidate.project_id, successor_owner
            )
            if len(predecessors) == 1 and len(successors) == 1:
                edge = db.query(Dependency).filter(
                    Dependency.project_id == candidate.project_id,
                    Dependency.predecessor_commitment_id == predecessors[0].id,
                    Dependency.successor_commitment_id == successors[0].id,
                ).first()
                if edge:
                    return f"Dependency #{edge.id}"

    return None


def _serialize_candidate(db, candidate):
    """CandidateResponse plus duplicate_of, computed on read.

    Only pending candidates are checked: once reviewed, the candidate no
    longer competes with the records it would create.
    """
    data = serialize_candidate(candidate).model_dump()

    if candidate.status == "PENDING":
        data["duplicate_of"] = _duplicate_of(db, candidate)

    return data


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


def _confirm_pending(db, candidate_id):
    """Confirm one pending candidate: validate, create the authoritative
    record, commit. Raises HTTPException on failure."""
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

        dependency_type = _field(payload, "dependency_type") or "BLOCKS"

        # The intake queue must enforce the same project rule as the
        # dependency form (SRS UC06): confirming a candidate is not
        # allowed to store an edge POST /dependencies would refuse.
        existing_edges = db.query(Dependency).filter(
            Dependency.project_id == candidate.project_id
        ).all()

        for edge in existing_edges:
            if (
                edge.predecessor_commitment_id == predecessor.id
                and edge.successor_commitment_id == successor.id
                and edge.dependency_type == dependency_type
            ):
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "DUPLICATE_DEPENDENCY",
                        "message": (
                            f"{predecessor.owner} already blocks "
                            f"{successor.owner} ({dependency_type})."
                        ),
                        "dependency_id": edge.id,
                    }
                )

        cycle = find_cycle_with_edge(
            existing_edges,
            predecessor.id,
            successor.id
        )

        if cycle:
            commitments_by_id = {
                commitment.id: commitment
                for commitment in db.query(Commitment).filter(
                    Commitment.project_id == candidate.project_id
                ).all()
            }

            raise HTTPException(
                status_code=409,
                detail=cycle_rejection_payload(
                    cycle,
                    existing_edges,
                    commitments_by_id,
                    DependencyCreate(
                        project_id=candidate.project_id,
                        predecessor_commitment_id=predecessor.id,
                        successor_commitment_id=successor.id,
                        dependency_type=dependency_type,
                    )
                )
            )

        record = Dependency(
            project_id=candidate.project_id,
            predecessor_commitment_id=predecessor.id,
            successor_commitment_id=successor.id,
            dependency_type=dependency_type
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
    }


@router.post(
    "/{candidate_id}/confirm",
    response_model=CandidateConfirmResponse
)
def confirm_candidate(
    candidate_id: int,
    db: Session = Depends(get_db)
):
    """Single confirmation: the human gate for one candidate."""
    result = _confirm_pending(db, candidate_id)

    candidate = db.query(Candidate).filter(
        Candidate.id == candidate_id
    ).first()

    return {
        "candidate_id": result["candidate_id"],
        "created_id": result["created_id"],
        "candidate": serialize_candidate(candidate),
    }


@router.post(
    "/confirm-batch",
    response_model=CandidateBatchConfirmResponse
)
def confirm_candidates_batch(
    request: CandidateBatchConfirmRequest,
    db: Session = Depends(get_db)
):
    """Confirm many candidates in one request (feedback point 1).

    Partial success is reported item by item: earlier candidates stay
    confirmed even when a later one fails. Duplicates are skipped by
    default — re-stating an existing record in a meeting should not
    re-enter it into the trace; single confirm remains the deliberate
    path for genuine re-statements.
    """
    confirmed = []
    failed = []
    skipped_duplicates = []

    for candidate_id in request.candidate_ids:
        candidate = db.query(Candidate).filter(
            Candidate.id == candidate_id
        ).first()

        if not candidate:
            failed.append({
                "candidate_id": candidate_id,
                "detail": "Candidate not found",
            })
            continue

        if candidate.status != "PENDING":
            failed.append({
                "candidate_id": candidate_id,
                "detail": "Only pending candidates can be confirmed",
            })
            continue

        if _duplicate_of(db, candidate):
            skipped_duplicates.append(candidate_id)
            continue

        try:
            result = _confirm_pending(db, candidate_id)
            confirmed.append({
                "candidate_id": result["candidate_id"],
                "created_id": result["created_id"],
            })
        except HTTPException as exc:
            failed.append({
                "candidate_id": candidate_id,
                "detail": str(exc.detail),
            })

    return {
        "confirmed": confirmed,
        "failed": failed,
        "skipped_duplicates": skipped_duplicates,
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
