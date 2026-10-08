from pydantic import BaseModel, ConfigDict


class DecisionCreate(BaseModel):
    project_id: int
    source_discussion_id: int | None = None
    title: str
    rationale: str | None = None
    status: str = "CONFIRMED"


class DecisionResponse(BaseModel):
    id: int
    project_id: int
    source_discussion_id: int | None
    title: str
    rationale: str | None
    status: str

    model_config = ConfigDict(from_attributes=True)