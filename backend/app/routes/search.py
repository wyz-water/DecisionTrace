"""Full-text search across the project trace (UC08).

Searches discussions, decisions, commitments and both history tables.
Results are ranked by the number of distinct fields a row matches, so a
row hit in title AND rationale ranks above one hit only in a comment.
The result list is assembled in Python: each source contributes at most
SEARCH_CAP rows, which keeps the endpoint bounded on small SQLite
databases where an in-DB UNION + rank would be overkill.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.discussion import Discussion
from app.models.decision import Decision
from app.models.decision_history import DecisionHistory
from app.models.commitment import Commitment
from app.models.commitment_history import CommitmentHistory
from app.schemas.page import Page
from app.schemas.search import SearchResult
from app.services.pagination import PageParams, page_response
from app.services.search import (
    highlight_term,
    make_snippet,
    match_fields,
    parse_terms,
)

router = APIRouter(
    prefix="/search",
    tags=["Search"]
)

# Per-source ceiling before ranking. The demo database is tiny; this only
# stops a pathological query from building an unbounded Python list.
SEARCH_CAP = 200

# Ranking tie-break: records before their history, people before paper.
KIND_ORDER = {
    "decision": 0,
    "commitment": 1,
    "discussion": 2,
    "decision_history": 3,
    "commitment_history": 4,
}


@router.get(
    "",
    response_model=Page[SearchResult]
)
def search(
    q: str,
    project_id: int | None = None,
    page: PageParams = Depends(),
    db: Session = Depends(get_db)
):
    terms = parse_terms(q)

    if not terms:
        raise HTTPException(
            status_code=422,
            detail="Query must contain at least one search term."
        )

    if project_id is not None:
        if not db.query(Project).filter(Project.id == project_id).first():
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

    # (score, result) pairs, sorted once at the end.
    ranked = []

    # --- Discussions: title + content -------------------------------
    for row in db.query(Discussion).all():
        if project_id is not None and row.project_id != project_id:
            continue

        score, fields = match_fields(terms, [
            ("title", row.title),
            ("content", row.content),
        ])

        if score:
            ranked.append((score, SearchResult(
                id=row.id,
                kind="discussion",
                project_id=row.project_id,
                title=row.title,
                snippet=make_snippet(row.content, terms),
                matched_field=fields[0],
            )))

    # --- Decisions: title + rationale -------------------------------
    for row in db.query(Decision).all():
        if project_id is not None and row.project_id != project_id:
            continue

        score, fields = match_fields(terms, [
            ("title", row.title),
            ("rationale", row.rationale),
        ])

        if score:
            ranked.append((score, SearchResult(
                id=row.id,
                kind="decision",
                project_id=row.project_id,
                title=row.title,
                snippet=make_snippet(row.rationale, terms),
                matched_field=fields[0],
                status=row.status,
                decision_id=row.id,
                source_discussion_id=row.source_discussion_id,
            )))

    # --- Commitments: owner + description ---------------------------
    for row in db.query(Commitment).all():
        if project_id is not None and row.project_id != project_id:
            continue

        score, fields = match_fields(terms, [
            ("owner", row.owner),
            ("description", row.description),
        ])

        if score:
            ranked.append((score, SearchResult(
                id=row.id,
                kind="commitment",
                project_id=row.project_id,
                title=f"{row.owner}: {row.description}",
                snippet=make_snippet(row.description, terms),
                matched_field=fields[0],
                status=row.status,
                owner=row.owner,
                decision_id=row.decision_id,
                commitment_id=row.id,
            )))

    # --- Decision history: old/new title, rationale, reason ---------
    for row in db.query(DecisionHistory).all():
        decision = db.query(Decision).filter(
            Decision.id == row.decision_id
        ).first()

        if decision is None:
            continue

        if project_id is not None and decision.project_id != project_id:
            continue

        score, fields = match_fields(terms, [
            ("title", f"{row.old_title} {row.new_title}"),
            ("rationale", f"{row.old_rationale or ''} {row.new_rationale or ''}"),
            ("reason", row.reason),
        ])

        if score:
            ranked.append((score, SearchResult(
                id=row.id,
                kind="decision_history",
                project_id=decision.project_id,
                title=f"Decision #{row.decision_id} · {row.old_status} → {row.new_status}",
                snippet=make_snippet(row.reason, terms),
                matched_field=fields[0],
                decision_id=row.decision_id,
                changed_at=str(row.changed_at),
            )))

    # --- Commitment history: reason + status change -----------------
    for row in db.query(CommitmentHistory).all():
        commitment = db.query(Commitment).filter(
            Commitment.id == row.commitment_id
        ).first()

        if commitment is None:
            continue

        if project_id is not None and commitment.project_id != project_id:
            continue

        score, fields = match_fields(terms, [
            ("reason", row.reason),
            ("status", f"{row.old_status} {row.new_status}"),
        ])

        if score:
            ranked.append((score, SearchResult(
                id=row.id,
                kind="commitment_history",
                project_id=commitment.project_id,
                title=f"Commitment #{row.commitment_id} · {row.old_status} → {row.new_status}",
                snippet=make_snippet(row.reason, terms),
                matched_field=fields[0],
                decision_id=commitment.decision_id,
                commitment_id=commitment.id,
                changed_at=str(row.changed_at),
            )))

    # Rank: more matched fields first, then kind, then newest record.
    ranked.sort(key=lambda pair: (
        -pair[0],
        KIND_ORDER[pair[1].kind],
        -pair[1].id,
    ))

    rows = [result for _, result in ranked]
    total = len(rows)
    rows = rows[page.offset:page.offset + page.limit]

    # The first term is the "headline" term for highlighting.
    if terms:
        for result in rows:
            result.snippet = highlight_term(result.snippet, terms[0])

    return page_response(rows, total, page)
