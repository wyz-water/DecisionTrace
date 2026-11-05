from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SnapshotCreate(BaseModel):
    title: str


class SnapshotResponse(BaseModel):
    id: int
    project_id: int
    title: str
    graph: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
