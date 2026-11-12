from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.argument import Argument
from app.schemas.argument import ArgumentResponse, ArgumentResolve
from app.schemas.page import Page
from app.services.pagination import PageParams, page_response, paginate
from app.statuses import ARGUMENT_STATUSES


router = APIRouter(
    prefix="/arguments",
    tags=["Arguments"]
)


@router.get(
    "",
    response_model=Page[ArgumentResponse]
)
def get_arguments(
    project_id: int | None = None,
    decision_id: int | None = None,
    page: PageParams = Depends(),
    db: Session = Depends(get_db)
):
    query = db.query(Argument)

    if project_id is not None:
        query = query.filter(Argument.project_id == project_id)

    if decision_id is not None:
        query = query.filter(Argument.decision_id == decision_id)

    # Oldest first: a deliberation reads as it happened, not backwards.
    query = query.order_by(
        Argument.created_at.asc(),
        Argument.id.asc()
    )

    rows, total = paginate(query, page)

    return page_response(rows, total, page)


@router.patch(
    "/{argument_id}",
    response_model=ArgumentResponse
)
def resolve_argument(
    argument_id: int,
    update: ArgumentResolve,
    db: Session = Depends(get_db)
):
    argument = db.query(Argument).filter(
        Argument.id == argument_id
    ).first()

    if not argument:
        raise HTTPException(
            status_code=404,
            detail="Argument not found"
        )

    status = update.status.upper()

    if status not in ARGUMENT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid argument status"
        )

    if not (update.resolved_reason or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Resolving an argument requires a reason"
        )

    argument.status = status
    argument.resolved_reason = update.resolved_reason.strip()

    db.commit()
    db.refresh(argument)

    return argument


@router.delete("/{argument_id}")
def delete_argument(
    argument_id: int,
    db: Session = Depends(get_db)
):
    argument = db.query(Argument).filter(
        Argument.id == argument_id
    ).first()

    if not argument:
        raise HTTPException(
            status_code=404,
            detail="Argument not found"
        )

    db.delete(argument)
    db.commit()

    return {"deleted": argument_id}
