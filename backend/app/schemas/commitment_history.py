from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CommitmentHistoryResponse(BaseModel):
    id: int
    commitment_id: int
    old_status: str
    new_status: str
    reason: str | None
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)