from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DecisionCreate(BaseModel):
    project_id: int
    source_discussion_id: int | None = None
    title: str
    rationale: str | None = None
    # Who made the decision; None = a team decision.
    decided_by: str | None = None
    status: str = "CONFIRMED"


class DecisionUpdate(BaseModel):
    title: str | None = None
    rationale: str | None = None
    status: str | None = None
    reason: str | None = None
    # Who made the decision (None = team decision). Explicitly settable
    # and clearable via model_fields_set, like the successor link.
    decided_by: str | None = None
    # Names the decision that replaced this one. Meaningful only when the
    # resulting status is SUPERSEDED; otherwise it is forced to None.
    superseded_by_decision_id: int | None = None


class DecisionResponse(BaseModel):
    id: int
    project_id: int
    source_discussion_id: int | None
    title: str
    rationale: str | None
    decided_by: str | None = None
    status: str
    superseded_by_decision_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class DecisionDependencyResponse(BaseModel):
    id: int
    predecessor_decision_id: int
    successor_decision_id: int
    dependency_type: str

    model_config = ConfigDict(from_attributes=True)


class DecisionDependenciesResponse(BaseModel):
    """The decision graph around one decision: what it rests on and
    what rests on it."""

    decision_id: int
    upstream: list[DecisionResponse]
    downstream: list[DecisionResponse]


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


class ReversalSignal(BaseModel):
    """One piece of the reversal narrative, each with its own citation.

    The frontend renders the timeline; the backend only reports facts it
    can point at (a history row, an argument, a commitment)."""
    type: str  # "reversal" | "successor" | "objection" | "slip"
    at: datetime | None
    summary: str
    citation: str | None
    source_text: str | None


class ReversalResponse(BaseModel):
    decision_id: int
    title: str
    status: str
    reversed: bool
    reversed_at: datetime | None
    lifespan_days: float | None
    reason: str | None
    superseded_by: DecisionResponse | None
    signals: list[ReversalSignal]