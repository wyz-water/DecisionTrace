from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ArgumentResponse(BaseModel):
    id: int
    project_id: int
    discussion_id: int | None
    decision_id: int | None
    stance: str
    claim: str
    author: str | None
    source_text: str | None
    status: str
    resolved_reason: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ArgumentResolve(BaseModel):
    """Resolving an argument needs a reason: objections are not silently
    dropped, they are closed with an explanation on record."""

    status: str = "RESOLVED"
    resolved_reason: str


class DeliberationResponse(BaseModel):
    decision_id: int
    title: str
    arguments: list[ArgumentResponse]
    # Computed on read (A13): at least one OPEN AGAINST argument.
    contested: bool
