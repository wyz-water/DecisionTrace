from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.schemas.project import ProjectCreate, ProjectResponse
from app.schemas.graph import ProjectGraphResponse
from app.services.graph import (
    analyze_node_states,
    detect_cycles,
    topological_order,
)


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


@router.get(
    "/{project_id}/graph",
    response_model=ProjectGraphResponse
)
def get_project_graph(
    project_id: int,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(
        Project.id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    commitments = db.query(Commitment).filter(
        Commitment.project_id == project_id
    ).all()

    dependencies = db.query(Dependency).filter(
        Dependency.project_id == project_id
    ).all()

    node_ids = [commitment.id for commitment in commitments]

    cycles = detect_cycles(dependencies, node_ids)

    commitments_by_id = {
        commitment.id: commitment
        for commitment in commitments
    }

    return {
        "project_id": project_id,
        "nodes": commitments,
        "edges": dependencies,
        "cycles": cycles,
        "has_cycles": len(cycles) > 0,
        "topological_order": topological_order(dependencies, node_ids),
        "analysis": analyze_node_states(commitments_by_id, dependencies),
    }