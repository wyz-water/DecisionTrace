from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.discussion import Discussion
from app.models.decision import Decision
from app.models.decision_history import DecisionHistory
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.schemas.decision import (
    DecisionCreate,
    DecisionResponse,
    DecisionUpdate,
    DecisionHistoryResponse,
    DecisionImpactResponse,
)
from app.services.graph import downstream_closure
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
        new_title == old_title
        and new_rationale == old_rationale
        and new_status == old_status
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

    db.commit()
    db.refresh(decision)

    return decision


@router.get(
    "/{decision_id}/history",
    response_model=list[DecisionHistoryResponse]
)
def get_decision_history(
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

    return db.query(DecisionHistory).filter(
        DecisionHistory.decision_id == decision_id
    ).order_by(
        DecisionHistory.changed_at.asc()
    ).all()


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
