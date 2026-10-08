from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.discussion import Discussion
from app.schemas.discussion import DiscussionCreate, DiscussionResponse


router = APIRouter(
    prefix="/discussions",
    tags=["Discussions"]
)


@router.post(
    "",
    response_model=DiscussionResponse
)
def create_discussion(
    discussion: DiscussionCreate,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(
        Project.id == discussion.project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    new_discussion = Discussion(
        project_id=discussion.project_id,
        title=discussion.title,
        content=discussion.content
    )

    db.add(new_discussion)
    db.commit()
    db.refresh(new_discussion)

    return new_discussion


@router.get(
    "",
    response_model=list[DiscussionResponse]
)
def get_discussions(
    db: Session = Depends(get_db)
):
    return db.query(Discussion).all()