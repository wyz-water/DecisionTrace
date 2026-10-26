from datetime import datetime

from pydantic import BaseModel


class CandidateResponse(BaseModel):
    id: int
    project_id: int
    discussion_id: int
    candidate_type: str
    payload: dict
    source_text: str | None
    status: str
    review_comment: str | None
    created_at: datetime


class CandidateUpdate(BaseModel):
    payload: dict | None = None
    review_comment: str | None = None


class CandidateReject(BaseModel):
    comment: str | None = None


class CandidateConfirmResponse(BaseModel):
    candidate_id: int
    created_id: int
    candidate: CandidateResponse


class ExtractResponse(BaseModel):
    discussion_id: int
    created: int
    candidates: list[CandidateResponse]
