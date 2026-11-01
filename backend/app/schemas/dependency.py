from datetime import date

from pydantic import BaseModel, ConfigDict


class DependencyCreate(BaseModel):
    project_id: int
    predecessor_commitment_id: int
    successor_commitment_id: int
    dependency_type: str = "BLOCKS"


class DependencyResponse(BaseModel):
    id: int
    project_id: int
    predecessor_commitment_id: int
    successor_commitment_id: int
    dependency_type: str

    model_config = ConfigDict(from_attributes=True)


class DependencyWarningNode(BaseModel):
    id: int
    owner: str
    due_date: date | None
    status: str


class DependencyWarning(BaseModel):
    code: str
    message: str
    suggestion: str
    predecessor: DependencyWarningNode
    successor: DependencyWarningNode


class DependencyCreated(DependencyResponse):
    """A stored dependency, plus anything the caller should know about it.

    The edge is accepted — a date inversion is a scheduling contradiction,
    not an invalid link — so this is advisory and travels with the 201
    instead of turning it into an error.
    """

    warning: DependencyWarning | None = None
