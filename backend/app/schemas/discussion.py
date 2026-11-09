from pydantic import BaseModel, ConfigDict


class DiscussionSummary(BaseModel):
    """Rule-based preview of a discussion's records: names per type.

    Computed from the content with the rule engine only (offline and
    deterministic), never stored. It is a preview of extraction, not a
    second opinion on it.
    """

    decisions: list[str]
    commitments: list[str]
    dependencies: list[str]
    total: int


class DiscussionCreate(BaseModel):
    project_id: int
    title: str
    content: str


class DiscussionResponse(BaseModel):
    id: int
    project_id: int
    title: str
    content: str
    summary: DiscussionSummary | None = None

    model_config = ConfigDict(from_attributes=True)


class DiscussionImportResponse(DiscussionResponse):
    """Import adds one fact the paste path does not have: which encoding
    the server detected, so the UI can tell the user what happened."""

    encoding: str