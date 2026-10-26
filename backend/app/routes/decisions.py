from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.discussion import Discussion
from app.models.decision import Decision
from app.schemas.decision import DecisionCreate, DecisionResponse


router = APIRouter(
    prefix="/decisions",
    tags=["Decisions"]
)


@router.post(
    "",
    response_model=DecisionResponse
)
def create_decision(
    decision: DecisionCreate,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(
        Project.id == decision.project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    if decision.source_discussion_id is not None:
        discussion = db.query(Discussion).filter(
            Discussion.id == decision.source_discussion_id
        ).first()

        if not discussion:
            raise HTTPException(
                status_code=404,
                detail="Source discussion not found"
            )

        if discussion.project_id != decision.project_id:
            raise HTTPException(
                status_code=400,
                detail="Discussion does not belong to this project"
            )

    new_decision = Decision(
        project_id=decision.project_id,
        source_discussion_id=decision.source_discussion_id,
        title=decision.title,
        rationale=decision.rationale,
        status=decision.status
    )

    db.add(new_decision)
    db.commit()
    db.refresh(new_decision)

    return new_decision


@router.get(
    "",
    response_model=list[DecisionResponse]
)
def get_decisions(
    project_id: int | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(Decision)

    if project_id is not None:
        query = query.filter(Decision.project_id == project_id)

    return query.all()