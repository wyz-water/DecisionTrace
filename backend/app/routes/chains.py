from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.chain import Chain
from app.models.chain_annotation import ChainAnnotation
from app.models.chain_comment import ChainComment
from app.models.commitment import Commitment
from app.models.decision import Decision
from app.models.dependency import Dependency
from app.models.project import Project
from app.schemas.chain import (
    ChainAnnotationResponse,
    ChainCommentCreate,
    ChainCommentResponse,
    ChainCreate,
    ChainDetail,
    ChainNodeCreate,
    ChainResponse,
    TeacherAction,
)
from app.schemas.execution import (
    ExecutionEdge,
    ExecutionResponse,
    ExecutionTask,
    ExecutionTaskCreate,
)
from app.services.graph import (
    analyze_node_states,
    detect_cycles,
    topological_order,
)
from app.schemas.decision import DecisionResponse

router = APIRouter(
    prefix="/chains",
    tags=["Chains"]
)


def _latest_node(db, chain):
    """The chain's live decision: its newest node. Earlier nodes are
    the chain's history — readable, but not approvable or executable."""
    return (
        db.query(Decision)
        .filter(Decision.chain_id == chain.id)
        .order_by(Decision.created_at.desc(), Decision.id.desc())
        .first()
    )


def _derived_chain_status(db, chain):
    """A chain is APPROVED when the supervisor has chosen one of its
    nodes (approval is a selection — the supervisor may pick any
    decision point, not necessarily the latest), PENDING when
    submitted with no choice yet, None while it is still a draft."""
    nodes = db.query(Decision).filter(Decision.chain_id == chain.id).all()

    if any(node.teacher_status == "APPROVED" for node in nodes):
        return "APPROVED"

    if chain.submitted_at is not None:
        return "PENDING"

    return None


def _chain_response(db, chain):
    return ChainResponse(
        id=chain.id,
        project_id=chain.project_id,
        title=chain.title,
        submitted_at=chain.submitted_at,
        teacher_status=_derived_chain_status(db, chain),
        node_count=db.query(Decision).filter(
            Decision.chain_id == chain.id
        ).count(),
        comment_count=db.query(ChainComment).filter(
            ChainComment.chain_id == chain.id
        ).count(),
        created_at=chain.created_at,
    )


TEACHER_STATUSES = {"APPROVED", "REJECTED", "HELD"}


def _chain_detail(db, chain):
    nodes = db.query(Decision).filter(
        Decision.chain_id == chain.id
    ).order_by(Decision.created_at.asc(), Decision.id.asc()).all()

    comments = db.query(ChainComment).filter(
        ChainComment.chain_id == chain.id
    ).order_by(ChainComment.created_at.asc(), ChainComment.id.asc()).all()

    annotations = db.query(ChainAnnotation).filter(
        ChainAnnotation.chain_id == chain.id
    ).order_by(
        ChainAnnotation.created_at.asc(), ChainAnnotation.id.asc()
    ).all()

    return ChainDetail(
        id=chain.id,
        project_id=chain.project_id,
        title=chain.title,
        submitted_at=chain.submitted_at,
        teacher_status=_derived_chain_status(db, chain),
        created_at=chain.created_at,
        nodes=nodes,
        comments=comments,
        annotations=annotations,
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
    submitted_only: bool = False,
    db: Session = Depends(get_db)
):
    query = db.query(Chain)

    if project_id is not None:
        query = query.filter(Chain.project_id == project_id)

    if submitted_only:
        query = query.filter(Chain.submitted_at.isnot(None))

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

    if _derived_chain_status(db, chain) == "APPROVED":
        raise HTTPException(
            status_code=400,
            detail=(
                "The chain's decision is approved and in execution — "
                "no further decisions can be added"
            ),
        )

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

    latest = _latest_node(db, chain)

    if latest is not None and latest.teacher_status is None:
        latest.teacher_status = "PENDING"

    db.commit()
    db.refresh(chain)

    return _chain_detail(db, chain)


@router.post(
    "/{chain_id}/teacher-action",
    response_model=ChainDetail
)
def teacher_action(
    chain_id: int,
    request: TeacherAction,
    db: Session = Depends(get_db)
):
    """The supervisor's verdict and/or annotation. A note may stand
    alone (pure guidance) or accompany any verdict; a rejection never
    deletes the chain — it becomes part of its history."""
    chain = db.query(Chain).filter(Chain.id == chain_id).first()

    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    status = (request.status or "").strip().upper() if request.status else None
    note = (request.note or "").strip() or None

    if status is None and note is None:
        raise HTTPException(
            status_code=400,
            detail="A verdict or a note is required",
        )

    if status is not None:
        if status not in TEACHER_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid teacher status: {status}",
            )

        # Approval is final (A12, R4): once a chain has an approved
        # point it is locked against further verdicts. Pure annotations
        # (status: null) remain allowed on any node.
        if _derived_chain_status(db, chain) == "APPROVED":
            raise HTTPException(
                status_code=400,
                detail=(
                    "The chain is approved and locked: the verdict is "
                    "final. Pure annotations remain allowed."
                ),
            )

        target_id = request.decision_id

        if target_id is None:
            latest = _latest_node(db, chain)
            target_id = latest.id if latest else None

        target = db.query(Decision).filter(
            Decision.id == target_id,
            Decision.chain_id == chain.id,
        ).first()

        if not target:
            raise HTTPException(
                status_code=400,
                detail="The verdict decision is not a node of this chain",
            )

        target.teacher_status = status

        # Approval is a selection: at most one node of a chain is the
        # approved one. Choosing a node overrules the chain's other
        # pending/held points — they become REJECTED (the supervisor's
        # choice settles the chain). Never-submitted points (null)
        # stay untouched drafts.
        if status == "APPROVED":
            for node in db.query(Decision).filter(
                Decision.chain_id == chain.id,
                Decision.id != target.id,
                Decision.teacher_status.in_(
                    ["PENDING", "HELD"]
                ),
            ).all():
                node.teacher_status = "REJECTED"

    if note is not None:
        annotation_decision_id = None

        if request.decision_id is not None:
            node = db.query(Decision).filter(
                Decision.id == request.decision_id,
                Decision.chain_id == chain.id,
            ).first()

            if not node:
                raise HTTPException(
                    status_code=400,
                    detail="The annotated decision is not a node of this chain",
                )

            annotation_decision_id = node.id

        db.add(ChainAnnotation(
            chain_id=chain.id,
            decision_id=annotation_decision_id,
            text=note,
        ))

    db.commit()
    db.refresh(chain)

    return _chain_detail(db, chain)


@router.post(
    "/{chain_id}/tasks",
    response_model=ExecutionTask
)
def add_chain_task(
    chain_id: int,
    request: ExecutionTaskCreate,
    db: Session = Depends(get_db)
):
    """Add an execution task to a chain. Tasks come from the chain
    discussion and may only be added after the supervisor approved
    the chain (the execution phase)."""
    chain = db.query(Chain).filter(Chain.id == chain_id).first()

    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    if _derived_chain_status(db, chain) != "APPROVED":
        raise HTTPException(
            status_code=400,
            detail=(
                "Tasks can only be added after the supervisor "
                "approves a decision of the chain"
            ),
        )

    if not (request.owner or "").strip() or not (request.description or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Task owner and description are required",
        )

    decision_id = request.decision_id

    if decision_id is None:
        latest_node = (
            db.query(Decision)
            .filter(Decision.chain_id == chain.id)
            .order_by(Decision.created_at.desc(), Decision.id.desc())
            .first()
        )
        decision_id = latest_node.id if latest_node else None
    else:
        node = db.query(Decision).filter(
            Decision.id == decision_id,
            Decision.chain_id == chain.id,
        ).first()

        if not node:
            raise HTTPException(
                status_code=400,
                detail="The task decision is not a node of this chain",
            )

    target_node = db.query(Decision).filter(
        Decision.id == decision_id
    ).first()

    if not target_node or target_node.teacher_status != "APPROVED":
        raise HTTPException(
            status_code=400,
            detail="Tasks can only be added to an approved decision",
        )

    task = Commitment(
        project_id=chain.project_id,
        chain_id=chain.id,
        decision_id=decision_id,
        owner=request.owner.strip(),
        description=request.description.strip(),
        due_date=request.due_date,
        status="OPEN",
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return _execution_task(db, task, [], None, {})


def _execution_task(db, task, analysis, position, owners):
    state = ""
    blocked_by = []
    waiting_on = []

    for item in analysis:
        if item["commitment_id"] == task.id:
            state = item["state"]
            blocked_by = [
                owners.get(node_id, f"#{node_id}")
                for node_id in item["blocked_by"]
            ]
            waiting_on = [
                owners.get(node_id, f"#{node_id}")
                for node_id in item["waiting_on"]
            ]
            break

    return ExecutionTask(
        id=task.id,
        owner=task.owner,
        description=task.description,
        due_date=task.due_date,
        status=task.status,
        state=state,
        position=position,
        blocked_by=blocked_by,
        waiting_on=waiting_on,
    )


@router.get(
    "/{chain_id}/execution",
    response_model=ExecutionResponse
)
def get_chain_execution(
    chain_id: int,
    decision_id: int | None = None,
    db: Session = Depends(get_db)
):
    """The execution board of a chain: its tasks in topological order,
    with computed readiness states and AI checks (cycles, blocked
    tasks, ordering violations). Computed on read, shared by both
    sides — the supervisor sees the same view read-only."""
    chain = db.query(Chain).filter(Chain.id == chain_id).first()

    if not chain:
        raise HTTPException(status_code=404, detail="Chain not found")

    tasks = db.query(Commitment).filter(
        Commitment.chain_id == chain.id
    )

    if decision_id is not None:
        tasks = tasks.filter(Commitment.decision_id == decision_id)

    tasks = tasks.all()

    task_ids = {task.id for task in tasks}

    edges = [
        edge
        for edge in db.query(Dependency).filter(
            Dependency.project_id == chain.project_id
        ).all()
        if (
            edge.predecessor_commitment_id in task_ids
            and edge.successor_commitment_id in task_ids
        )
    ]

    cycles = detect_cycles(edges, task_ids)
    has_cycles = len(cycles) > 0

    order = topological_order(edges, task_ids)

    commitments_by_id = {task.id: task for task in tasks}
    analysis = analyze_node_states(commitments_by_id, edges)

    owners = {task.id: task.owner for task in tasks}

    position_by_id = {
        node_id: index for index, node_id in enumerate(order)
    }

    task_views = [
        _execution_task(
            db,
            task,
            analysis,
            position_by_id.get(task.id),
            owners,
        )
        for task in sorted(
            tasks,
            key=lambda item: position_by_id.get(item.id, 999),
        )
    ]

    checks = []

    if has_cycles:
        checks.append({
            "type": "cycle",
            "message": "The task dependencies contain a cycle.",
        })

    for task in task_views:
        if task.state == "BLOCKED":
            checks.append({
                "type": "blocked",
                "message": (
                    f"'{task.description}' ({task.owner}) is blocked by "
                    + ", ".join(task.blocked_by)
                ),
            })
        elif task.status == "IN_PROGRESS" and task.waiting_on:
            checks.append({
                "type": "out_of_order",
                "message": (
                    f"'{task.description}' ({task.owner}) started before "
                    + ", ".join(task.waiting_on)
                    + " finished"
                ),
            })

    return {
        "chain_id": chain.id,
        "teacher_status": chain.teacher_status,
        "has_cycles": has_cycles,
        "tasks": task_views,
        "edges": [
            ExecutionEdge(
                predecessor_commitment_id=edge.predecessor_commitment_id,
                successor_commitment_id=edge.successor_commitment_id,
                dependency_type=edge.dependency_type,
            )
            for edge in edges
        ],
        "checks": checks,
    }
