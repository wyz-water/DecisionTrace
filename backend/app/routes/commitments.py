from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.decision import Decision
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.models.commitment_history import CommitmentHistory
from app.schemas.commitment_history import CommitmentHistoryResponse
from app.schemas.commitment import (
    CommitmentCreate,
    CommitmentResponse,
    CommitmentStatusUpdate,
    CommitmentImpactResponse,
)


router = APIRouter(
    prefix="/commitments",
    tags=["Commitments"]
)


@router.post(
    "",
    response_model=CommitmentResponse
)
def create_commitment(
    commitment: CommitmentCreate,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(
        Project.id == commitment.project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    if commitment.decision_id is not None:
        decision = db.query(Decision).filter(
            Decision.id == commitment.decision_id
        ).first()

        if not decision:
            raise HTTPException(
                status_code=404,
                detail="Decision not found"
            )

        if decision.project_id != commitment.project_id:
            raise HTTPException(
                status_code=400,
                detail="Decision does not belong to this project"
            )

    new_commitment = Commitment(
        project_id=commitment.project_id,
        decision_id=commitment.decision_id,
        owner=commitment.owner,
        description=commitment.description,
        due_date=commitment.due_date,
        status=commitment.status
    )

    db.add(new_commitment)
    db.commit()
    db.refresh(new_commitment)

    return new_commitment


@router.get(
    "",
    response_model=list[CommitmentResponse]
)
def get_commitments(
    db: Session = Depends(get_db)
):
    return db.query(Commitment).all()


@router.patch(
    "/{commitment_id}/status",
    response_model=CommitmentResponse
)
def update_commitment_status(
    commitment_id: int,
    status_update: CommitmentStatusUpdate,
    db: Session = Depends(get_db)
):
    commitment = db.query(Commitment).filter(
        Commitment.id == commitment_id
    ).first()

    if not commitment:
        raise HTTPException(
            status_code=404,
            detail="Commitment not found"
        )

    allowed_statuses = {
        "OPEN",
        "IN_PROGRESS",
        "COMPLETED",
        "DELAYED",
        "BLOCKED"
    }

    new_status = status_update.status.upper()

    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid commitment status"
        )

    old_status = commitment.status

    if old_status == new_status:
        raise HTTPException(
            status_code=400,
            detail="New status is the same as current status"
        )

    history = CommitmentHistory(
        commitment_id=commitment.id,
        old_status=old_status,
        new_status=new_status,
        reason=status_update.reason
    )

    db.add(history)

    commitment.status = new_status

    db.commit()
    db.refresh(commitment)

    return commitment

@router.get(
    "/{commitment_id}/impact",
    response_model=CommitmentImpactResponse
)
def get_commitment_impact(
    commitment_id: int,
    db: Session = Depends(get_db)
):
    commitment = db.query(Commitment).filter(
        Commitment.id == commitment_id
    ).first()

    if not commitment:
        raise HTTPException(
            status_code=404,
            detail="Commitment not found"
        )

    dependencies = db.query(Dependency).filter(
        Dependency.predecessor_commitment_id == commitment_id
    ).all()

    affected_commitments = []

    for dependency in dependencies:
        affected = db.query(Commitment).filter(
            Commitment.id == dependency.successor_commitment_id
        ).first()

        if affected:
            affected_commitments.append({
                "id": affected.id,
                "owner": affected.owner,
                "description": affected.description,
                "status": affected.status,
                "dependency_type": dependency.dependency_type,
                "reason": (
                    f"Commitment #{commitment.id} "
                    f"{dependency.dependency_type} "
                    f"commitment #{affected.id}"
                )
            })

    risky_statuses = {
        "DELAYED",
        "BLOCKED"
    }

    has_impact = (
        commitment.status in risky_statuses
        and len(affected_commitments) > 0
    )

    return {
        "commitment_id": commitment.id,
        "commitment_status": commitment.status,
        "has_impact": has_impact,
        "affected_commitments": affected_commitments
        if has_impact
        else []
    }
    
@router.get(
    "/{commitment_id}/history",
    response_model=list[CommitmentHistoryResponse]
)
def get_commitment_history(
    commitment_id: int,
    db: Session = Depends(get_db)
):
    commitment = db.query(Commitment).filter(
        Commitment.id == commitment_id
    ).first()

    if not commitment:
        raise HTTPException(
            status_code=404,
            detail="Commitment not found"
        )

    return db.query(CommitmentHistory).filter(
        CommitmentHistory.commitment_id == commitment_id
    ).order_by(
        CommitmentHistory.changed_at.asc()
    ).all()