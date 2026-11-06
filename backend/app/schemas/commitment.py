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
    path: list[int]
    depth: int


class CommitmentImpactResponse(BaseModel):
    commitment_id: int
    commitment_status: str
    has_impact: bool
    affected_commitments: list[AffectedCommitment]


class WhatIfAffectedCommitment(AffectedCommitment):
    """One downstream commitment, with whether this preview is new risk."""

    newly_affected: bool


class CommitmentWhatIfResponse(BaseModel):
    commitment_id: int
    current_status: str
    hypothetical_status: str
    preview: bool
    has_cycle: bool
    total: int
    current_total: int
    newly_affected: list[int]
    already_affected: list[int]
    affected: list[WhatIfAffectedCommitment]
