from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.decision import Decision
from app.models.commitment import Commitment
from app.schemas.commitment import CommitmentCreate, CommitmentResponse


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