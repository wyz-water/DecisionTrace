import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.discussion import Discussion
from app.models.decision import Decision
from app.models.candidate import Candidate
from app.schemas.candidate import (
    CandidateResponse,
    CandidateUpdate,
    CandidateReject,
    CandidateConfirmResponse,
    ExtractResponse,
)
from app.schemas.page import Page
from app.services.extractor import (
    extract_candidates,
    serialize_candidate,
)
from app.services.pagination import PageParams, page_response, paginate
from app.statuses import DECISION_STATUSES


router = APIRouter(
    prefix="/candidates",
    tags=["Candidates"]
)


_IDENTITY_FIELDS = {
    "DECISION": ("title",),
}


def _candidate_keys(candidate_type, payload, source_text):
    """Identity of one extracted record, used to make extraction repeatable."""
    keys = []

    expected = _IDENTITY_FIELDS.get(candidate_type, ())

    identity = tuple(
        payload.get(field)
        for field in expected
        if payload.get(field)
    )

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

    # Re-extraction has to be idempotent: a rejected candidate must not
    # come back, and the same sentence pasted twice yields the same key.
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
    }


@router.get(
    "",
    response_model=Page[CandidateResponse]
)
def get_candidates(
    project_id: int | None = None,
    discussion_id: int | None = None,
    status: str | None = None,
    decided_by: str | None = None,
    page: PageParams = Depends(),
    db: Session = Depends(get_db)
):
    query = db.query(Candidate)

    if project_id is not None:
        query = query.filter(Candidate.project_id == project_id)

    if discussion_id is not None:
        query = query.filter(Candidate.discussion_id == discussion_id)

    if status is not None:
        statuses = [
            value.strip().upper()
            for value in status.split(",")
            if value.strip()
        ]

        if statuses:
            query = query.filter(Candidate.status.in_(statuses))

    query = query.order_by(
        Candidate.created_at.desc(),
        Candidate.id.desc()
    )

    rows, total = paginate(query, page)

    # Per-person review ("review mine"): only that maker's DECISION
    # candidates remain. Filtered in Python — the per-person queue is
    # small and the payload is JSON.
    if decided_by is not None:
        key = decided_by.strip()

        rows = [
            candidate
            for candidate in rows
            if candidate.candidate_type == "DECISION"
            and _field(json.loads(candidate.payload), "decided_by")
            and _field(json.loads(candidate.payload), "decided_by").strip().lower()
            == key.lower()
        ]
        total = len(rows)

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
    string."""
    value = payload.get(key)

    if not isinstance(value, str):
        return None

    value = value.strip()

    return value or None


def _duplicate_of(db, candidate):
    """Name the authoritative record this pending candidate repeats.
    Restating an existing decision in a meeting is the common case."""
    payload = json.loads(candidate.payload)

    if not isinstance(payload, dict):
        return None

    if candidate.candidate_type == "DECISION":
        title = _field(payload, "title")
        if title:
            existing = _find_decision_by_title_tolerant(
                db, candidate.project_id, title
            )
            if existing:
                return f"Decision #{existing.id}"

    return None


def _serialize_candidate(db, candidate):
    data = serialize_candidate(candidate).model_dump()

    if candidate.status == "PENDING":
        data["duplicate_of"] = _duplicate_of(db, candidate)

    return data


def _find_decision_by_title(db, project_id, title):
    return db.query(Decision).filter(
        Decision.project_id == project_id,
        func.lower(Decision.title) == title.lower()
    ).first()


def _find_decision_by_title_tolerant(db, project_id, title):
    """Exact title match first, then prefix-tolerant both ways."""
    existing = _find_decision_by_title(db, project_id, title)

    if existing:
        return existing

    def strip_prefix(value):
        lowered = value.strip().lower()
        for prefix in ("use ", "using ", "to "):
            if lowered.startswith(prefix):
                return lowered[len(prefix):]
        return lowered

    needle = strip_prefix(title)

    for row in db.query(Decision).filter(
        Decision.project_id == project_id
    ).all():
        if strip_prefix(row.title) == needle:
            return row

    return None


def _normalize_status(value, allowed, default):
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

    if candidate.candidate_type != "DECISION":
        raise HTTPException(
            status_code=400,
            detail=f"Unknown candidate type: {candidate.candidate_type}"
        )

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
        decided_by=_field(payload, "decided_by"),
        status=status
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
    """Single confirmation: the human gate for one candidate — the
    maker confirms their own decision."""
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
