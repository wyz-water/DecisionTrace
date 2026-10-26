from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DecisionCreate(BaseModel):
    project_id: int
    source_discussion_id: int | None = None
    title: str
    rationale: str | None = None
    status: str = "CONFIRMED"


class DecisionUpdate(BaseModel):
    title: str | None = None
    rationale: str | None = None
    status: str | None = None
    reason: str | None = None


class DecisionResponse(BaseModel):
    id: int
    project_id: int
    source_discussion_id: int | None
    title: str
    rationale: str | None
    status: str

    model_config = ConfigDict(from_attributes=True)


class DecisionHistoryResponse(BaseModel):
    id: int
    decision_id: int
    old_title: str
    new_title: str
    old_rationale: str | None
    new_rationale: str | None
    old_status: str
    new_status: str
    reason: str | None
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LinkedCommitment(BaseModel):
    id: int
    owner: str
    description: str
    status: str
    downstream: list[int]


class DecisionImpactResponse(BaseModel):
    decision_id: int
    title: str
    status: str
    change_count: int
    has_changes: bool
    affected_commitments: list[LinkedCommitment]