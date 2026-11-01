from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.schemas.dependency import DependencyCreate, DependencyResponse
from app.services.graph import find_cycle_with_edge


router = APIRouter(
    prefix="/dependencies",
    tags=["Dependencies"]
)


def cycle_rejection_payload(
    cycle_ids: list[int],
    edges,
    commitments_by_id,
    dependency: DependencyCreate
):
    """Describe the loop a refused edge would have closed.

    The client renders this directly, so it carries names rather than
    ids: who waits on whom, which hop is the new link, and the single
    action worth recommending.
    """
    node_ids = cycle_ids[:-1]

    nodes = []
    for commitment_id in node_ids:
        commitment = commitments_by_id[commitment_id]
        nodes.append({
            "id": commitment.id,
            "owner": commitment.owner,
            "description": commitment.description,
            "due_date": (
                commitment.due_date.isoformat()
                if commitment.due_date
                else None
            ),
            "status": commitment.status,
        })

    by_pair = {
        (edge.predecessor_commitment_id, edge.successor_commitment_id): edge
        for edge in edges
    }

    hops = []
    for index in range(len(cycle_ids) - 1):
        source = cycle_ids[index]
        target = cycle_ids[index + 1]
        edge = by_pair.get((source, target))

        hops.append({
            "from": source,
            "to": target,
            "dependency_type": (
                edge.dependency_type
                if edge
                else dependency.dependency_type
            ),
            "dependency_id": edge.id if edge else None,
            "is_new": edge is None,
        })

    predecessor = commitments_by_id[dependency.predecessor_commitment_id]
    successor = commitments_by_id[dependency.successor_commitment_id]

    chain = [
        commitments_by_id[commitment_id].owner
        for commitment_id in cycle_ids
    ]

    # The task worth flagging is the one that is still work in flight.
    # Recommending "mark as blocked" for a COMPLETED task would be
    # nonsense, and for an already-BLOCKED one the update would 400.
    ordered_ids = [successor.id]
    for commitment_id in node_ids:
        if commitment_id not in ordered_ids:
            ordered_ids.append(commitment_id)

    candidates = [
        commitment_id
        for commitment_id in ordered_ids
        if commitments_by_id[commitment_id].status not in {"COMPLETED", "BLOCKED"}
    ]

    if candidates:
        target = commitments_by_id[candidates[0]]
        recommendation = {
            "commitment_id": target.id,
            "owner": target.owner,
            "description": target.description,
            "action": "MARK_BLOCKED",
            "status": "BLOCKED",
            "message": (
                f"{target.owner}'s \"{target.description}\" sits inside this "
                "loop, so it cannot start or finish until the ordering is "
                "decided. Mark it BLOCKED and record why."
            ),
        }
    else:
        recommendation = {
            "commitment_id": None,
            "action": "REVIEW_LINKS",
            "message": (
                "Every task in this loop is already completed or blocked, "
                "so nothing can be parked. Review the links and remove the "
                "one that is out of date."
            ),
        }

    return {
        "code": "CYCLE_DETECTED",
        "message": (
            f"{predecessor.owner} blocking {successor.owner} would close a "
            "loop: " + " -> ".join(chain) + "."
        ),
        "chain": chain,
        "cycle": cycle_ids,
        "nodes": nodes,
        "hops": hops,
        "attempted": {
            "predecessor_commitment_id": predecessor.id,
            "predecessor_owner": predecessor.owner,
            "predecessor_description": predecessor.description,
            "successor_commitment_id": successor.id,
            "successor_owner": successor.owner,
            "successor_description": successor.description,
            "dependency_type": dependency.dependency_type,
        },
        "recommendation": recommendation,
    }


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

    existing_edges = db.query(Dependency).filter(
        Dependency.project_id == dependency.project_id
    ).all()

    for edge in existing_edges:
        if (
            edge.predecessor_commitment_id == predecessor.id
            and edge.successor_commitment_id == successor.id
            and edge.dependency_type == dependency.dependency_type
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "DUPLICATE_DEPENDENCY",
                    "message": (
                        f"{predecessor.owner} already blocks "
                        f"{successor.owner} ({dependency.dependency_type})."
                    ),
                    "dependency_id": edge.id,
                }
            )

    # Refuse the edge before it is stored (SRS UC06, 7.5): a dependency
    # that would make the plan circular must never reach the database.
    cycle = find_cycle_with_edge(
        existing_edges,
        predecessor.id,
        successor.id
    )

    if cycle:
        commitments_by_id = {
            commitment.id: commitment
            for commitment in db.query(Commitment).filter(
                Commitment.project_id == dependency.project_id
            ).all()
        }

        raise HTTPException(
            status_code=409,
            detail=cycle_rejection_payload(
                cycle,
                existing_edges,
                commitments_by_id,
                dependency
            )
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