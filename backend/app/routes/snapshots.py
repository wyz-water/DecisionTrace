"""Graph snapshots: the "meeting summary as a graph" concept.

A snapshot stores the project graph (nodes, edges, topological order,
cycle and blocked-by analysis) at the moment it is taken, plus a title
and timestamp. The graph payload is exactly what the live
``/projects/{id}/graph`` endpoint returns, so reviewing a snapshot shows
the state of the trace at that point in time.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.models.snapshot import Snapshot
from app.schemas.snapshot import (
    SnapshotCreate,
    SnapshotDiffResponse,
    SnapshotResponse,
    SnapshotSummary,
)
from app.schemas.page import Page
from app.services.graph import build_graph_payload
from app.services.pagination import PageParams, page_response, paginate
from app.services.snapshot_diff import diff_graphs


router = APIRouter(
    prefix="/projects",
    tags=["Snapshots"]
)


def _node_dict(commitment):
    """ORM row → plain dict, so the JSON column can serialize it."""
    return {
        "id": commitment.id,
        "project_id": commitment.project_id,
        "decision_id": commitment.decision_id,
        "owner": commitment.owner,
        "description": commitment.description,
        "due_date": (
            commitment.due_date.isoformat() if commitment.due_date else None
        ),
        "status": commitment.status,
    }


def _edge_dict(dependency):
    return {
        "id": dependency.id,
        "project_id": dependency.project_id,
        "predecessor_commitment_id": dependency.predecessor_commitment_id,
        "successor_commitment_id": dependency.successor_commitment_id,
        "dependency_type": dependency.dependency_type,
    }


def _snapshot_summary(snapshot):
    """List rows need counts, not a second copy of the whole graph."""
    graph = snapshot.graph or {}

    return {
        "id": snapshot.id,
        "project_id": snapshot.project_id,
        "title": snapshot.title,
        "created_at": snapshot.created_at,
        "node_count": len(graph.get("nodes") or []),
        "edge_count": len(graph.get("edges") or []),
        "has_cycles": bool(graph.get("has_cycles") or graph.get("cycles")),
    }


def _snapshot_ref(snapshot):
    return {
        "id": snapshot.id,
        "title": snapshot.title,
        "created_at": snapshot.created_at,
    }


@router.post(
    "/{project_id}/snapshots",
    response_model=SnapshotResponse
)
def create_snapshot(
    project_id: int,
    snapshot: SnapshotCreate,
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

    graph = build_graph_payload(commitments, dependencies)

    # The JSON column needs plain data, not ORM rows: serialize nodes and
    # edges (the derived structures are already plain dicts/lists).
    graph["nodes"] = [_node_dict(node) for node in graph["nodes"]]
    graph["edges"] = [_edge_dict(edge) for edge in graph["edges"]]

    new_snapshot = Snapshot(
        project_id=project_id,
        title=snapshot.title,
        graph=graph
    )

    db.add(new_snapshot)
    db.commit()
    db.refresh(new_snapshot)

    return new_snapshot


@router.get(
    "/{project_id}/snapshots",
    response_model=Page[SnapshotSummary]
)
def get_snapshots(
    project_id: int,
    page: PageParams = Depends(),
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

    query = db.query(Snapshot).filter(
        Snapshot.project_id == project_id
    ).order_by(Snapshot.id.desc())

    rows, total = paginate(query, page)

    return page_response(
        [_snapshot_summary(row) for row in rows],
        total,
        page
    )


@router.get(
    "/{project_id}/snapshots/{from_id}/diff/{to_id}",
    response_model=SnapshotDiffResponse
)
def get_snapshot_diff(
    project_id: int,
    from_id: int,
    to_id: int,
    db: Session = Depends(get_db)
):
    """Compare two snapshots from the same project.

    The direction matters: "from" is the older state and "to" is the
    newer state. Reversing the ids produces the inverse diff.
    """
    project = db.query(Project).filter(
        Project.id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    from_snapshot = db.query(Snapshot).filter(
        Snapshot.id == from_id,
        Snapshot.project_id == project_id
    ).first()

    to_snapshot = db.query(Snapshot).filter(
        Snapshot.id == to_id,
        Snapshot.project_id == project_id
    ).first()

    if not from_snapshot or not to_snapshot:
        raise HTTPException(
            status_code=404,
            detail="Snapshot not found"
        )

    diff = diff_graphs(from_snapshot.graph, to_snapshot.graph)

    return {
        "from_snapshot": _snapshot_ref(from_snapshot),
        "to_snapshot": _snapshot_ref(to_snapshot),
        **diff,
    }


@router.get(
    "/{project_id}/snapshots/{snapshot_id}",
    response_model=SnapshotResponse
)
def get_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db)
):
    snapshot = db.query(Snapshot).filter(
        Snapshot.id == snapshot_id,
        Snapshot.project_id == project_id
    ).first()

    if not snapshot:
        raise HTTPException(
            status_code=404,
            detail="Snapshot not found"
        )

    return snapshot


@router.delete(
    "/{project_id}/snapshots/{snapshot_id}",
    response_model=SnapshotResponse
)
def delete_snapshot(
    project_id: int,
    snapshot_id: int,
    db: Session = Depends(get_db)
):
    snapshot = db.query(Snapshot).filter(
        Snapshot.id == snapshot_id,
        Snapshot.project_id == project_id
    ).first()

    if not snapshot:
        raise HTTPException(
            status_code=404,
            detail="Snapshot not found"
        )

    db.delete(snapshot)
    db.commit()

    return snapshot
