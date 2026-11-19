from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.commitment import Commitment
from app.models.commitment_history import CommitmentHistory
from app.schemas.commitment_history import CommitmentHistoryResponse
from app.schemas.page import Page
from app.schemas.commitment import (
    CommitmentResponse,
    CommitmentStatusUpdate,
)
from app.services.pagination import PageParams, page_response, paginate


router = APIRouter(
    prefix="/commitments",
    tags=["Commitments"]
)


@router.patch(
    "/{commitment_id}/status",
    response_model=CommitmentResponse
)
def update_commitment_status(
    commitment_id: int,
    status_update: CommitmentStatusUpdate,
    db: Session = Depends(get_db)
):
    commitment = db.query(Commitment).filter(
        Commitment.id == commitment_id
    ).first()

    if not commitment:
        raise HTTPException(
            status_code=404,
            detail="Commitment not found"
        )

    allowed_statuses = {
        "OPEN",
        "IN_PROGRESS",
        "COMPLETED",
        "DELAYED",
        "BLOCKED"
    }

    new_status = status_update.status.upper()

    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid commitment status"
        )

    old_status = commitment.status

    if old_status == new_status:
        raise HTTPException(
            status_code=400,
            detail="New status is the same as current status"
        )

    history = CommitmentHistory(
        commitment_id=commitment.id,
        old_status=old_status,
        new_status=new_status,
        reason=status_update.reason
    )

    db.add(history)

    commitment.status = new_status

    db.commit()
    db.refresh(commitment)

    return commitment

@router.get(
    "/{commitment_id}/history",
    response_model=Page[CommitmentHistoryResponse]
)
def get_commitment_history(
    commitment_id: int,
    page: PageParams = Depends(),
    db: Session = Depends(get_db)
):
    commitment = db.query(Commitment).filter(
        Commitment.id == commitment_id
    ).first()

    if not commitment:
        raise HTTPException(
            status_code=404,
            detail="Commitment not found"
        )

    # Newest first: an audit trail is read backwards from "what happened
    # last", and that is also the change a user just made.
    query = db.query(CommitmentHistory).filter(
        CommitmentHistory.commitment_id == commitment_id
    ).order_by(
        CommitmentHistory.changed_at.desc(),
        CommitmentHistory.id.desc()
    )

    rows, total = paginate(query, page)

    return page_response(rows, total, page)
