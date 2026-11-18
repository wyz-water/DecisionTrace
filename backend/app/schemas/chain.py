from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.decision import DecisionResponse


class ChainCreate(BaseModel):
    project_id: int
    # The initial decision the chain is created from.
    decision_id: int


class ChainNodeCreate(BaseModel):
    """Append a new decision node to the chain (a follow-up or a
    reversal — both are just the next node)."""
    title: str
    rationale: str | None = None
    decided_by: str | None = None


class ChainCommentCreate(BaseModel):
    author: str | None = None
    text: str
    # Pin the comment to one node; null = a general chain comment.
    decision_id: int | None = None


class ChainCommentResponse(BaseModel):
    id: int
    chain_id: int
    decision_id: int | None
    author: str | None
    text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChainAnnotationResponse(BaseModel):
    id: int
    chain_id: int
    text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TeacherAction(BaseModel):
    """The supervisor's verdict and/or annotation. At least one of the
    two must be given; a note may accompany any verdict, and a note
    alone (no status) is a pure annotation."""
    status: str | None = None  # APPROVED | REJECTED | HELD
    note: str | None = None


class ChainResponse(BaseModel):
    id: int
    project_id: int
    title: str
    submitted_at: datetime | None
    teacher_status: str | None
    node_count: int
    comment_count: int
    created_at: datetime


class ChainDetail(BaseModel):
    id: int
    project_id: int
    title: str
    submitted_at: datetime | None
    teacher_status: str | None
    created_at: datetime
    nodes: list[DecisionResponse]
    comments: list[ChainCommentResponse]
    annotations: list[ChainAnnotationResponse]
