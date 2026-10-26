from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.schemas.dependency import DependencyCreate, DependencyResponse


router = APIRouter(
    prefix="/dependencies",
    tags=["Dependencies"]
)


@router.post(
    "",
    response_model=DependencyResponse
)
def create_dependency(
    dependency: DependencyCreate,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(
        Project.id == dependency.project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    predecessor = db.query(Commitment).filter(
        Commitment.id == dependency.predecessor_commitment_id
    ).first()

    if not predecessor:
        raise HTTPException(
            status_code=404,
            detail="Predecessor commitment not found"
        )

    successor = db.query(Commitment).filter(
        Commitment.id == dependency.successor_commitment_id
    ).first()

    if not successor:
        raise HTTPException(
            status_code=404,
            detail="Successor commitment not found"
        )

    if predecessor.project_id != dependency.project_id:
        raise HTTPException(
            status_code=400,
            detail="Predecessor commitment does not belong to this project"
        )

    if successor.project_id != dependency.project_id:
        raise HTTPException(
            status_code=400,
            detail="Successor commitment does not belong to this project"
        )

    if predecessor.id == successor.id:
        raise HTTPException(
            status_code=400,
            detail="A commitment cannot depend on itself"
        )

    new_dependency = Dependency(
        project_id=dependency.project_id,
        predecessor_commitment_id=dependency.predecessor_commitment_id,
        successor_commitment_id=dependency.successor_commitment_id,
        dependency_type=dependency.dependency_type
    )

    db.add(new_dependency)
    db.commit()
    db.refresh(new_dependency)

    return new_dependency


@router.get(
    "",
    response_model=list[DependencyResponse]
)
def get_dependencies(
    project_id: int | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(Dependency)

    if project_id is not None:
        query = query.filter(Dependency.project_id == project_id)

    return query.all()


@router.delete(
    "/{dependency_id}",
    response_model=DependencyResponse
)
def delete_dependency(
    dependency_id: int,
    db: Session = Depends(get_db)
):
    dependency = db.query(Dependency).filter(
        Dependency.id == dependency_id
    ).first()

    if not dependency:
        raise HTTPException(
            status_code=404,
            detail="Dependency not found"
        )

    db.delete(dependency)
    db.commit()

    return dependency