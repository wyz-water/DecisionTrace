from datetime import date

from pydantic import BaseModel


class StakeholderDecision(BaseModel):
    """A decision as the stakeholder sees it: who decided it, whether
    it still stands, and whether it is contested right now."""

    id: int
    title: str
    rationale: str | None
    status: str
    decided_by: str | None
    contested: bool


class StakeholderCommitment(BaseModel):
    """The stakeholder's own commitment, with its computed readiness."""

    id: int
    owner: str
    description: str
    due_date: date | None
    status: str
    state: str
    blocked_by: list[str]
    waiting_on: list[str]


class WaitingOn(BaseModel):
    """Someone downstream of the stakeholder's work."""

    commitment_id: int
    owner: str
    description: str
    status: str


class StakeholderResponse(BaseModel):
    """The answer to "what does the responsible person want to see":
    their decisions (do they still stand?), the decisions their work
    rests on, where their own commitments are stuck, who is waiting on
    them, and which decisions rest on theirs."""

    project_id: int
    name: str
    decisions_made: list[StakeholderDecision]
    decisions_affecting_me: list[StakeholderDecision]
    commitments: list[StakeholderCommitment]
    waiting_on_me: list[WaitingOn]
    decisions_resting_on_mine: list[StakeholderDecision]
