from pydantic import BaseModel


class Conflict(BaseModel):
    type: str
    severity: str
    message: str
    commitment_ids: list[int]
    decision_ids: list[int]


class ProjectConflictsResponse(BaseModel):
    project_id: int
    conflict_count: int
    conflicts: list[Conflict]
