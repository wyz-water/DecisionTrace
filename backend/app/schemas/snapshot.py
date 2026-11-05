from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SnapshotCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class SnapshotSummary(BaseModel):
    """List item: metadata and counts, without the full graph payload."""

    id: int
    project_id: int
    title: str
    created_at: datetime
    node_count: int
    edge_count: int
    has_cycles: bool


class SnapshotResponse(BaseModel):
    """Single snapshot, including the saved graph for the viewer."""

    id: int
    project_id: int
    title: str
    graph: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SnapshotRef(BaseModel):
    id: int
    title: str
    created_at: datetime


class SnapshotDiffResponse(BaseModel):
    from_snapshot: SnapshotRef
    to_snapshot: SnapshotRef
    summary: dict
    nodes: dict
    edges: dict
    topology: dict
    analysis: dict
