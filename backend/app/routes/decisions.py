from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.discussion import Discussion
from app.models.decision import Decision
from app.models.decision_history import DecisionHistory
from app.models.commitment import Commitment
from app.models.commitment_history import CommitmentHistory
from app.models.dependency import Dependency
from app.models.argument import Argument
from app.schemas.argument import DeliberationResponse
from app.schemas.decision import (
    DecisionCreate,
    DecisionResponse,
    DecisionUpdate,
    DecisionHistoryResponse,
    DecisionImpactResponse,
    ReversalResponse,
)
from app.schemas.page import Page
from app.services.graph import downstream_closure
from app.services.pagination import PageParams, page_response, paginate
from app.services.retrospective import _as_utc
from app.statuses import DECISION_STATUSES


router = APIRouter(
    prefix="/decisions",
    tags=["Decisions"]
)


@router.post(
    "",
    response_model=DecisionResponse
)
def create_decision(
    decision: DecisionCreate,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(
        Project.id == decision.project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    if decision.source_discussion_id is not None:
        discussion = db.query(Discussion).filter(
            Discussion.id == decision.source_discussion_id
        ).first()

        if not discussion:
            raise HTTPException(
                status_code=404,
                detail="Source discussion not found"
            )

        if discussion.project_id != decision.project_id:
            raise HTTPException(
                status_code=400,
                detail="Discussion does not belong to this project"
            )

    status = decision.status.upper()

    if status not in DECISION_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid decision status"
        )

    # Feedback point 0 (decision goals): a manually created decision must
    # record its goal. Extracted candidates are exempt — their goal
    # context is the source discussion they point back to.
    if not (decision.rationale or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Rationale is required: a decision must record its goal"
        )

    new_decision = Decision(
        project_id=decision.project_id,
        source_discussion_id=decision.source_discussion_id,
        title=decision.title,
        rationale=decision.rationale,
        status=status
    )

    db.add(new_decision)
    db.commit()
    db.refresh(new_decision)

    return new_decision


@router.get(
    "",
    response_model=list[DecisionResponse]
)
def get_decisions(
    project_id: int | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(Decision)

    if project_id is not None:
        query = query.filter(Decision.project_id == project_id)

    return query.all()


@router.patch(
    "/{decision_id}",
    response_model=DecisionResponse
)
def update_decision(
    decision_id: int,
    update: DecisionUpdate,
    db: Session = Depends(get_db)
):
    decision = db.query(Decision).filter(
        Decision.id == decision_id
    ).first()

    if not decision:
        raise HTTPException(
            status_code=404,
            detail="Decision not found"
        )

    old_title = decision.title
    old_rationale = decision.rationale
    old_status = decision.status

    new_title = update.title if update.title is not None else old_title
    new_rationale = (
        update.rationale
        if update.rationale is not None
        else old_rationale
    )

    new_status = (
        update.status.upper()
        if update.status is not None
        else old_status
    )

    if (
        update.status is not None
        and new_status not in DECISION_STATUSES
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid decision status"
        )

    if (
        update.rationale is not None
        and not update.rationale.strip()
    ):
        # A decision must keep its recorded goal (feedback point 0):
        # revision may change the rationale, but never erase it.
        raise HTTPException(
            status_code=400,
            detail="Rationale is required: a decision must record its goal"
        )

    # Reversal is a first-class relationship: SUPERSEDED may name the
    # decision that replaced it. Any other status forces the link to
    # None, so a resurrected decision cannot keep pointing at a
    # successor it no longer has.
    new_superseded_by = decision.superseded_by_decision_id

    if new_status != "SUPERSEDED":
        new_superseded_by = None
    elif "superseded_by_decision_id" in update.model_fields_set:
        # Only an explicit value (or explicit null) changes the link: a
        # title-only edit must not silently drop the successor.
        new_superseded_by = update.superseded_by_decision_id

        if new_superseded_by is not None:
            successor = db.query(Decision).filter(
                Decision.id == new_superseded_by
            ).first()

            if not successor:
                raise HTTPException(
                    status_code=404,
                    detail="Superseding decision not found"
                )

            if successor.id == decision.id:
                raise HTTPException(
                    status_code=400,
                    detail="A decision cannot supersede itself"
                )

            if successor.project_id != decision.project_id:
                raise HTTPException(
                    status_code=400,
                    detail="The superseding decision must be in the same project"
                )

            if successor.status != "CONFIRMED":
                raise HTTPException(
                    status_code=400,
                    detail="The superseding decision must be CONFIRMED"
                )

    if (
        new_title == old_title
        and new_rationale == old_rationale
        and new_status == old_status
        and new_superseded_by == decision.superseded_by_decision_id
    ):
        raise HTTPException(
            status_code=400,
            detail="No changes provided"
        )

    history = DecisionHistory(
        decision_id=decision.id,
        old_title=old_title,
        new_title=new_title,
        old_rationale=old_rationale,
        new_rationale=new_rationale,
        old_status=old_status,
        new_status=new_status,
        reason=update.reason
    )

    db.add(history)

    decision.title = new_title
    decision.rationale = new_rationale
    decision.status = new_status
    decision.superseded_by_decision_id = new_superseded_by

    db.commit()
    db.refresh(decision)

    return decision


@router.get(
    "/{decision_id}/history",
    response_model=Page[DecisionHistoryResponse]
)
def get_decision_history(
    decision_id: int,
    page: PageParams = Depends(),
    db: Session = Depends(get_db)
):
    decision = db.query(Decision).filter(
        Decision.id == decision_id
    ).first()

    if not decision:
        raise HTTPException(
            status_code=404,
            detail="Decision not found"
        )

    # Newest first, matching the commitment audit trail.
    query = db.query(DecisionHistory).filter(
        DecisionHistory.decision_id == decision_id
    ).order_by(
        DecisionHistory.changed_at.desc(),
        DecisionHistory.id.desc()
    )

    rows, total = paginate(query, page)

    return page_response(rows, total, page)


@router.get(
    "/{decision_id}/deliberation",
    response_model=DeliberationResponse
)
def get_decision_deliberation(
    decision_id: int,
    db: Session = Depends(get_db)
):
    decision = db.query(Decision).filter(
        Decision.id == decision_id
    ).first()

    if not decision:
        raise HTTPException(
            status_code=404,
            detail="Decision not found"
        )

    arguments = db.query(Argument).filter(
        Argument.decision_id == decision_id
    ).order_by(
        Argument.created_at.asc(),
        Argument.id.asc()
    ).all()

    # Contested is computed (A13), never stored: nobody can mark a
    # decision contested by hand, and the badge cannot drift from the
    # arguments that justify it.
    contested = any(
        argument.status == "OPEN" and argument.stance == "AGAINST"
        for argument in arguments
    )

    return {
        "decision_id": decision.id,
        "title": decision.title,
        "arguments": arguments,
        "contested": contested,
    }


@router.get(
    "/{decision_id}/impact",
    response_model=DecisionImpactResponse
)
def get_decision_impact(
    decision_id: int,
    db: Session = Depends(get_db)
):
    decision = db.query(Decision).filter(
        Decision.id == decision_id
    ).first()

    if not decision:
        raise HTTPException(
            status_code=404,
            detail="Decision not found"
        )

    change_count = db.query(DecisionHistory).filter(
        DecisionHistory.decision_id == decision_id
    ).count()

    linked_commitments = db.query(Commitment).filter(
        Commitment.decision_id == decision_id
    ).all()

    project_commitments = db.query(Commitment).filter(
        Commitment.project_id == decision.project_id
    ).all()

    project_dependencies = db.query(Dependency).filter(
        Dependency.project_id == decision.project_id
    ).all()

    commitments_by_id = {
        commitment.id: commitment
        for commitment in project_commitments
    }

    affected = []

    for commitment in linked_commitments:
        downstream = downstream_closure(
            commitment.id,
            commitments_by_id,
            project_dependencies
        )

        affected.append({
            "id": commitment.id,
            "owner": commitment.owner,
            "description": commitment.description,
            "status": commitment.status,
            "downstream": [item["commitment"].id for item in downstream],
        })

    return {
        "decision_id": decision.id,
        "title": decision.title,
        "status": decision.status,
        "change_count": change_count,
        "has_changes": change_count > 0,
        "affected_commitments": affected,
    }


def _reversal_payload(decision, db):
    """The reversal narrative for an overturned decision.

    Every signal cites a real row — the flip in the history, the
    successor, the objections that accumulated, the commitments that
    slipped — so the narrative can never invent a fact the trace does
    not contain (the same rule as A11 for the ask view).
    """
    flip = (
        db.query(DecisionHistory)
        .filter(
            DecisionHistory.decision_id == decision.id,
            DecisionHistory.new_status.in_(["SUPERSEDED", "REVOKED"]),
        )
        .order_by(DecisionHistory.changed_at.asc(), DecisionHistory.id.asc())
        .first()
    )

    lifespan = None

    if flip and decision.created_at is not None and flip.changed_at is not None:
        lifespan = round(
            (_as_utc(flip.changed_at) - _as_utc(decision.created_at))
            .total_seconds() / 86400,
            1,
        )

    signals = []

    if flip:
        signals.append({
            "type": "reversal",
            "at": flip.changed_at,
            "summary": flip.reason or "No reason was recorded.",
            "citation": f"history #{flip.id}",
            "source_text": None,
        })

    successor = (
        db.query(Decision)
        .filter(Decision.id == decision.superseded_by_decision_id)
        .first()
        if decision.superseded_by_decision_id is not None
        else None
    )

    if successor:
        signals.append({
            "type": "successor",
            "at": successor.created_at,
            "summary": (
                f"Superseded by decision #{successor.id} "
                f"'{successor.title}'"
            ),
            "citation": successor.rationale,
            "source_text": None,
        })

    objections = (
        db.query(Argument)
        .filter(
            Argument.decision_id == decision.id,
            Argument.stance == "AGAINST",
        )
        .order_by(Argument.created_at.asc(), Argument.id.asc())
        .all()
    )

    for objection in objections:
        author = objection.author or "A team member"

        state = objection.status.lower()

        if objection.status == "RESOLVED" and objection.resolved_reason:
            state = f"{state}: {objection.resolved_reason}"

        signals.append({
            "type": "objection",
            "at": objection.created_at,
            "summary": f"{author} objected: '{objection.claim}'",
            "citation": f"argument #{objection.id} ({state})",
            "source_text": objection.source_text,
        })

    slipped = (
        db.query(Commitment)
        .filter(
            Commitment.decision_id == decision.id,
            Commitment.status.in_(["DELAYED", "BLOCKED"]),
        )
        .all()
    )

    for commitment in slipped:
        transition = (
            db.query(CommitmentHistory)
            .filter(
                CommitmentHistory.commitment_id == commitment.id,
                CommitmentHistory.new_status.in_(["DELAYED", "BLOCKED"]),
            )
            .order_by(
                CommitmentHistory.changed_at.asc(),
                CommitmentHistory.id.asc(),
            )
            .first()
        )

        signals.append({
            "type": "slip",
            "at": transition.changed_at if transition else None,
            "summary": (
                f"'{commitment.description}' ({commitment.owner}) "
                f"is {commitment.status.lower()}"
            ),
            "citation": f"commitment #{commitment.id}",
            "source_text": None,
        })

    return {
        "decision_id": decision.id,
        "title": decision.title,
        "status": decision.status,
        "reversed": True,
        "reversed_at": flip.changed_at if flip else None,
        "lifespan_days": lifespan,
        "reason": flip.reason if flip else None,
        "superseded_by": successor,
        "signals": signals,
    }


@router.get(
    "/{decision_id}/reversal",
    response_model=ReversalResponse
)
def get_decision_reversal(
    decision_id: int,
    db: Session = Depends(get_db)
):
    """The reversal trace: why this decision did not hold.

    For SUPERSEDED/REVOKED decisions, the narrative is assembled from
    the trace — the flip, the successor, the objections, the slips. For
    live decisions, `reversed` is False and the signal list is empty;
    the UI hides the panel instead of asking.
    """
    decision = db.query(Decision).filter(
        Decision.id == decision_id
    ).first()

    if not decision:
        raise HTTPException(
            status_code=404,
            detail="Decision not found"
        )

    if decision.status not in {"SUPERSEDED", "REVOKED"}:
        return {
            "decision_id": decision.id,
            "title": decision.title,
            "status": decision.status,
            "reversed": False,
            "reversed_at": None,
            "lifespan_days": None,
            "reason": None,
            "superseded_by": None,
            "signals": [],
        }

    return _reversal_payload(decision, db)
