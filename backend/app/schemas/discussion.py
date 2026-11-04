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


class DiscussionImportResponse(DiscussionResponse):
    """Import adds one fact the paste path does not have: which encoding
    the server detected, so the UI can tell the user what happened."""

    encoding: str