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
    """One downstream commitment, with whether this preview is new risk.

    ``severity`` is the effective severity under the hypothetical
    (BLOCKED > DELAYED > None, propagated along BLOCKS edges);
    ``baseline_severity`` is the same without the hypothetical, so the
    UI can show what got worse, not just what is affected."""

    newly_affected: bool
    baseline_severity: str | None
    severity: str | None


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
    # Ids whose severity strictly increased under the hypothetical.
    escalated: list[int]
    # Blocked/delayed counts over the affected set, before and after.
    severity_counts: dict
    baseline_severity_counts: dict
    affected: list[WhatIfAffectedCommitment]
