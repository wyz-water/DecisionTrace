from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.discussion import Discussion
from app.schemas.discussion import DiscussionCreate, DiscussionResponse
from app.schemas.page import Page
from app.services.pagination import PageParams, page_response, paginate


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
    response_model=Page[DiscussionResponse]
)
def get_discussions(
    project_id: int | None = None,
    page: PageParams = Depends(),
    db: Session = Depends(get_db)
):
    query = db.query(Discussion)

    if project_id is not None:
        query = query.filter(Discussion.project_id == project_id)

    # Newest first: a discussion is added so it can be extracted from,
    # and the one just pasted is the one the user is looking for.
    query = query.order_by(Discussion.id.desc())

    rows, total = paginate(query, page)

    return page_response(rows, total, page)