from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.candidate import Candidate
from app.models.decision import Decision
from app.models.discussion import Discussion
from app.schemas.discussion import (
    DiscussionCreate,
    DiscussionImportResponse,
    DiscussionResponse,
)
from app.schemas.page import Page
from app.services.importing import (
    decode_text_bytes,
    extract_docx_text,
    extract_pdf_text,
)
from app.services.pagination import PageParams, page_response, paginate


router = APIRouter(
    prefix="/discussions",
    tags=["Discussions"]
)


TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".text"}
MAX_IMPORT_BYTES = 5 * 1024 * 1024


@router.post(
    "/import",
    response_model=DiscussionImportResponse
)
async def import_discussion(
    project_id: int = Form(...),
    file: UploadFile = File(...),
    title: str | None = Form(None),
    db: Session = Depends(get_db)
):
    """Create a discussion from an uploaded file.

    Supported: .txt / .md (UTF-8 or GBK), .docx, .pdf. The decoded text
    becomes the discussion content; the filename (minus extension)
    becomes the title unless one is provided.
    """
    project = db.query(Project).filter(
        Project.id == project_id
    ).first()

    if not project:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    filename = file.filename or "discussion"
    extension = Path(filename).suffix.lower()

    if extension not in TEXT_EXTENSIONS | {".docx", ".pdf"}:
        raise HTTPException(
            status_code=415,
            detail=(
                "Unsupported file type. Import .txt, .md, .docx or .pdf."
            )
        )

    data = await file.read()

    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File is larger than 5 MB; split the notes and retry."
        )

    if extension in TEXT_EXTENSIONS:
        content, encoding = decode_text_bytes(data)
    elif extension == ".docx":
        content, encoding = extract_docx_text(data), "DOCX"
    else:
        content, encoding = extract_pdf_text(data), "PDF"

    if not content.strip():
        raise HTTPException(
            status_code=400,
            detail="That file contains no text."
        )

    new_discussion = Discussion(
        project_id=project_id,
        title=(title or Path(filename).stem or "Imported discussion"),
        content=content
    )

    db.add(new_discussion)
    db.commit()
    db.refresh(new_discussion)

    return DiscussionImportResponse(
        id=new_discussion.id,
        project_id=new_discussion.project_id,
        title=new_discussion.title,
        content=new_discussion.content,
        encoding=encoding,
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
@router.delete(
    "/{discussion_id}",
    response_model=DiscussionResponse
)
def delete_discussion(
    discussion_id: int,
    db: Session = Depends(get_db)
):
    discussion = db.query(Discussion).filter(
        Discussion.id == discussion_id
    ).first()

    if not discussion:
        raise HTTPException(
            status_code=404,
            detail="Discussion not found"
        )

    # Candidates live and die with their source text. Records already
    # confirmed from them stay authoritative; only the pointer back to
    # this discussion is cleared so nothing references a missing row.
    db.query(Candidate).filter(
        Candidate.discussion_id == discussion.id
    ).delete(synchronize_session=False)

    db.query(Decision).filter(
        Decision.source_discussion_id == discussion.id
    ).update({"source_discussion_id": None}, synchronize_session=False)

    db.delete(discussion)
    db.commit()

    return discussion
