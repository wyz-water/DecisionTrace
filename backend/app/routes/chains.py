from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.chain import Chain
from app.models.chain_comment import ChainComment
from app.models.decision import Decision
from app.models.project import Project
from app.schemas.chain import (
    ChainCommentCreate,
    ChainCommentResponse,
    ChainCreate,
    ChainDetail,
    ChainNodeCreate,
    ChainResponse,
)
from app.schemas.decision import DecisionResponse

router = APIRouter(
    prefix="/chains",
    tags=["Chains"]
)


def _chain_response(db, chain):
    return ChainResponse(
        id=chain.id,
        project_id=chain.project_id,
        title=chain.title,
        submitted_at=chain.submitted_at,
        teacher_status=chain.teacher_status,
        node_count=db.query(Decision).filter(
            Decision.chain_id == chain.id
        ).count(),
        comment_count=db.query(ChainComment).filter(
            ChainComment.chain_id == chain.id
        ).count(),
        created_at=chain.created_at,
    )


def _chain_detail(db, chain):
    nodes = db.query(Decision).filter(
        Decision.chain_id == chain.id
    ).order_by(Decision.created_at.asc(), Decision.id.asc()).all()

    comments = db.query(ChainComment).filter(
        ChainComment.chain_id == chain.id
    ).order_by(ChainComment.created_at.asc(), ChainComment.id.asc()).all()

    return ChainDetail(
        id=chain.id,
        project_id=chain.project_id,
        title=chain.title,
        submitted_at=chain.submitted_at,
        teacher_status=chain.teacher_status,
        created_at=chain.created_at,
        nodes=nodes,
        comments=comments,
    )


@router.post("", response_model=ChainDetail)
def create_chain(
    request: ChainCreate,
    db: Session = Depends(get_db)
):
    """Start a chain from an existing decision: the decision becomes
    the chain's first node and the chain takes its title."""
    project = db.query(Project).filter(
        Project.id == request.project_id
    ).first()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    decision = db.query(Decision).filter(
        Decision.id == request.decision_id,
        Decision.project_id == request.project_id,
    ).first()

    if not decision:
        raise HTTPException(
            status_code=404,
            detail="Decision not found in this project",
        )

    if decision.chain_id is not None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Decision #{decision.id} already belongs to "
                f"chain #{decision.chain_id}"
            ),
        )

    chain = Chain(
        project_id=request.project_id,
        title=decision.title,
    )

    db.add(chain)
    db.flush()

    decision.chain_id = chain.id
    db.commit()
    db.refresh(chain)

    return _chain_detail(db, chain)


@router.get("", response_model=list[ChainResponse])
def get_chains(
    project_id: int | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(Chain)

    if project_id is not None:
        query = query.filter(Chain.project_id == project_id)

    chains = query.order_by(
        Chain.created_at.asc(), Chain.id.asc()
    ).all()

    return [_chain_response(db, chain) for chain in chains]


@router.get("/{chain_id}", response_model=ChainDetail)
def get_chain(
    chain_id: int,
    db: Session = Depends(get_db)
):
    chain = db.query(Chain).filter(Chain.id == chain_id).first()

    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    return _chain_detail(db, chain)


@router.post(
    "/{chain_id}/nodes",
    response_model=DecisionResponse
)
def append_chain_node(
    chain_id: int,
    request: ChainNodeCreate,
    db: Session = Depends(get_db)
):
    """Append the next decision node — a follow-up or a reversal, both
    are just the next step of the same chain."""
    chain = db.query(Chain).filter(Chain.id == chain_id).first()

    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    title = (request.title or "").strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Node title cannot be empty",
        )

    node = Decision(
        project_id=chain.project_id,
        chain_id=chain.id,
        title=title,
        rationale=(request.rationale or "").strip() or None,
        decided_by=(request.decided_by or "").strip() or None,
        status="CONFIRMED",
    )

    db.add(node)
    db.commit()
    db.refresh(node)

    return node


@router.post(
    "/{chain_id}/comments",
    response_model=ChainCommentResponse
)
def add_chain_comment(
    chain_id: int,
    request: ChainCommentCreate,
    db: Session = Depends(get_db)
):
    chain = db.query(Chain).filter(Chain.id == chain_id).first()

    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    if not (request.text or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Comment text cannot be empty",
        )

    if request.decision_id is not None:
        node = db.query(Decision).filter(
            Decision.id == request.decision_id,
            Decision.chain_id == chain.id,
        ).first()

        if not node:
            raise HTTPException(
                status_code=400,
                detail="The pinned decision is not a node of this chain",
            )

    comment = ChainComment(
        chain_id=chain.id,
        decision_id=request.decision_id,
        author=(request.author or "").strip() or None,
        text=request.text.strip(),
    )

    db.add(comment)
    db.commit()
    db.refresh(comment)

    return comment


@router.post(
    "/{chain_id}/submit",
    response_model=ChainDetail
)
def submit_chain(
    chain_id: int,
    db: Session = Depends(get_db)
):
    """Members submit the chain to the supervisor: the only gate on
    the student side. Re-submission is allowed and updates the
    timestamp (the chain is never frozen)."""
    chain = db.query(Chain).filter(Chain.id == chain_id).first()

    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    chain.submitted_at = datetime.now(timezone.utc)
    chain.teacher_status = "PENDING"

    db.commit()
    db.refresh(chain)

    return _chain_detail(db, chain)
