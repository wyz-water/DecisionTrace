from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.decision import Decision
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.schemas.project import ProjectCreate, ProjectResponse
from app.schemas.graph import ProjectGraphResponse
from app.schemas.conflict import ProjectConflictsResponse
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


@router.get(
    "/{project_id}/conflicts",
    response_model=ProjectConflictsResponse
)
def get_project_conflicts(
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

    decisions = {
        decision.id: decision
        for decision in db.query(Decision).filter(
            Decision.project_id == project_id
        ).all()
    }

    by_id = {
        commitment.id: commitment
        for commitment in commitments
    }

    conflicts = []

    # 1. Circular dependencies.
    for cycle in detect_cycles(dependencies, list(by_id.keys())):
        unique_ids = list(dict.fromkeys(cycle))

        owners = [
            by_id[item].owner
            for item in unique_ids
            if item in by_id
        ]

        conflicts.append({
            "type": "CYCLE",
            "severity": "ERROR",
            "message": (
                "Circular dependency: " + " → ".join(owners + owners[:1])
            ),
            "commitment_ids": unique_ids,
            "decision_ids": [],
        })

    # 2. Completed work that depends on unfinished work.
    for dependency in dependencies:
        predecessor = by_id.get(dependency.predecessor_commitment_id)
        successor = by_id.get(dependency.successor_commitment_id)

        if not predecessor or not successor:
            continue

        if (
            successor.status == "COMPLETED"
            and predecessor.status != "COMPLETED"
        ):
            conflicts.append({
                "type": "ORDER_VIOLATION",
                "severity": "ERROR",
                "message": (
                    f"{successor.owner} (#{successor.id}) is completed, "
                    f"but predecessor {predecessor.owner} (#{predecessor.id}) "
                    f"is still {predecessor.status.replace('_', ' ').lower()}"
                ),
                "commitment_ids": [successor.id, predecessor.id],
                "decision_ids": [],
            })

    # 3. Successor due before its predecessor.
    for dependency in dependencies:
        predecessor = by_id.get(dependency.predecessor_commitment_id)
        successor = by_id.get(dependency.successor_commitment_id)

        if (
            not predecessor
            or not successor
            or not predecessor.due_date
            or not successor.due_date
            or successor.status == "COMPLETED"
        ):
            continue

        if successor.due_date < predecessor.due_date:
            conflicts.append({
                "type": "DATE_INVERSION",
                "severity": "WARNING",
                "message": (
                    f"{successor.owner} (#{successor.id}) is due "
                    f"{successor.due_date}, before predecessor "
                    f"{predecessor.owner} (#{predecessor.id}) "
                    f"due {predecessor.due_date}"
                ),
                "commitment_ids": [successor.id, predecessor.id],
                "decision_ids": [],
            })

    # 4. Duplicate commitments: same owner and same description.
    grouped = {}

    for commitment in commitments:
        key = (
            commitment.owner.strip().lower(),
            " ".join(commitment.description.strip().lower().split()),
        )

        grouped.setdefault(key, []).append(commitment.id)

    for key, ids in grouped.items():
        if len(ids) > 1:
            conflicts.append({
                "type": "DUPLICATE",
                "severity": "WARNING",
                "message": (
                    f"{key[0].title()} has {len(ids)} commitments with the "
                    "same description: "
                    + ", ".join(f"#{item}" for item in ids)
                ),
                "commitment_ids": ids,
                "decision_ids": [],
            })

    # 5. Open commitments linked to superseded or revoked decisions.
    for commitment in commitments:
        if (
            commitment.decision_id is None
            or commitment.status == "COMPLETED"
        ):
            continue

        decision = decisions.get(commitment.decision_id)

        if decision and decision.status in {"SUPERSEDED", "REVOKED"}:
            conflicts.append({
                "type": "STALE_DECISION",
                "severity": "WARNING",
                "message": (
                    f"{commitment.owner} (#{commitment.id}) is still "
                    f"{commitment.status.replace('_', ' ').lower()} but its "
                    f"decision '{decision.title}' was "
                    f"{decision.status.replace('_', ' ').lower()}"
                ),
                "commitment_ids": [commitment.id],
                "decision_ids": [decision.id],
            })

    return {
        "project_id": project_id,
        "conflict_count": len(conflicts),
        "conflicts": conflicts,
    }