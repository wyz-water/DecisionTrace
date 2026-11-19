from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.candidate import Candidate
from app.models.chain import Chain
from app.models.chain_annotation import ChainAnnotation
from app.models.chain_comment import ChainComment
from app.models.commitment import Commitment
from app.models.commitment_history import CommitmentHistory
from app.models.decision import Decision
from app.models.decision_history import DecisionHistory
from app.models.dependency import Dependency
from app.models.discussion import Discussion
from app.schemas.project import ProjectCreate, ProjectResponse


router = APIRouter(
    prefix="/projects",
    tags=["Projects"]
)
@router.post(
    "",
    response_model=ProjectResponse
)
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db)
):
    new_project = Project(
        name=project.name,
        description=project.description
    )

    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    return new_project


@router.get(
    "",
    response_model=list[ProjectResponse]
)
def get_projects(
    db: Session = Depends(get_db)
):
    return db.query(Project).all()


