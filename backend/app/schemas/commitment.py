from datetime import date

from pydantic import BaseModel, ConfigDict


class CommitmentCreate(BaseModel):
    project_id: int
    decision_id: int | None = None
    owner: str
    description: str
    due_date: date | None = None
    status: str = "OPEN"


class CommitmentResponse(BaseModel):
    id: int
    project_id: int
    decision_id: int | None
    owner: str
    description: str
    due_date: date | None
    status: str

    model_config = ConfigDict(from_attributes=True)
    

class CommitmentStatusUpdate(BaseModel):
    status: str
    reason: str | None = None
    

class AffectedCommitment(BaseModel):
    id: int
    owner: str
    description: str
    status: str
    dependency_type: str
    reason: str


class CommitmentImpactResponse(BaseModel):
    commitment_id: int
    commitment_status: str
    has_impact: bool
    affected_commitments: list[AffectedCommitment]