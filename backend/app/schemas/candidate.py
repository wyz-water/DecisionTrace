from datetime import datetime

from pydantic import BaseModel

from app.schemas.discussion import DiscussionSummary


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
    # Set for pending candidates that repeat an existing authoritative
    # record ("Decision #3"); None otherwise. Computed on read, never
    # stored — there is no cache to go stale.
    duplicate_of: str | None = None


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
    # Candidates the discussion already had (any status). Surfaced so the
    # UI can say "nothing new" instead of silently returning an empty list.
    skipped: int = 0
    candidates: list[CandidateResponse]
    # Rule-based preview of what the discussion contains (counts and names
    # per record type). Deterministic, offline, and computed with the rule
    # engine even when LLM extraction is enabled.
    summary: DiscussionSummary


class CandidateBatchConfirmRequest(BaseModel):
    candidate_ids: list[int]


class CandidateBatchConfirmItem(BaseModel):
    candidate_id: int
    created_id: int


class CandidateBatchConfirmFailure(BaseModel):
    candidate_id: int
    detail: str


class CandidateBatchConfirmResponse(BaseModel):
    confirmed: list[CandidateBatchConfirmItem]
    failed: list[CandidateBatchConfirmFailure]
    skipped_duplicates: list[int]
