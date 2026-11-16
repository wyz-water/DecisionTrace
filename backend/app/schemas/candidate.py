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


class Challenge(BaseModel):
    """One drafted counter-consideration before a decision lands.

    Computed on read, never stored: the id is stable within one
    computation, and confirm re-drafts and checks that every current
    challenge was resolved."""
    id: str
    kind: str
    claim: str
    source_text: str | None
    citation: str | None


class ChallengesResponse(BaseModel):
    candidate_id: int
    decision_title: str
    challenges: list[Challenge]
    total: int


class ChallengeResolution(BaseModel):
    challenge_id: str
    resolved_reason: str


class CandidateConfirmRequest(BaseModel):
    """Optional body for single confirm: when challenge_resolutions is
    given, every currently drafted challenge must be resolved with a
    reason. Omitted -> the plain confirm path (backward compatible)."""
    challenge_resolutions: list[ChallengeResolution] | None = None


class CandidateConfirmResponse(BaseModel):
    candidate_id: int
    created_id: int
    challenges_recorded: int | None = None
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
