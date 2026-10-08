from pydantic import BaseModel, ConfigDict


class DiscussionCreate(BaseModel):
    project_id: int
    title: str
    content: str


class DiscussionResponse(BaseModel):
    id: int
    project_id: int
    title: str
    content: str

    model_config = ConfigDict(from_attributes=True)