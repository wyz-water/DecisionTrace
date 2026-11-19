from datetime import date

from pydantic import BaseModel


class ExecutionTaskCreate(BaseModel):
    """A task from the chain discussion: who does what by when. Binds
    to a specific decision node of the chain (default: the latest)."""
    owner: str
    description: str
    due_date: date | None = None
    decision_id: int | None = None


class ExecutionTask(BaseModel):
    id: int
    owner: str
    description: str
    due_date: date | None
    status: str
    state: str
    position: int | None  # index in the topological order
    blocked_by: list[str]
    waiting_on: list[str]


class ExecutionCheck(BaseModel):
    type: str  # "cycle" | "blocked" | "out_of_order"
    message: str


class ExecutionEdge(BaseModel):
    predecessor_commitment_id: int
    successor_commitment_id: int
    dependency_type: str


class ExecutionResponse(BaseModel):
    chain_id: int
    teacher_status: str | None
    has_cycles: bool
    tasks: list[ExecutionTask]
    edges: list[ExecutionEdge]
    checks: list[ExecutionCheck]
