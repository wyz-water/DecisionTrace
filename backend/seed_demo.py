# -*- coding: utf-8 -*-
"""Build the realistic demo dataset for DecisionTrace.

Rebuilds project 1 in decisiontrace.db with a complete two-sided
story — every feature has something to show:

- Decisions view: unapproved decisions (held / pending / draft chains,
  plus one free decision).
- Intake: one pending candidate with its maker's color.
- Chains: chat-style discussions, node evolution, submissions.
- Teacher: one APPROVED chain (executing), one PENDING (awaiting a
  decision), one HELD (with an annotation), one draft.
- Execution: tasks in topological order with a real AI check (a task
  started before its predecessor finished).

Usage:  python seed_demo.py   (from the backend directory)
Also refreshes decisiontrace.pristine.db so future demos start here.
"""
import shutil
import sqlite3
from datetime import datetime, timezone

DATABASE = "decisiontrace.db"
PRISTINE = "decisiontrace.pristine.db"

# All timestamps are explicit so the story reads chronologically.
T = lambda s: datetime.fromisoformat(s).isoformat()  # noqa: E731


def wipe(conn):
    tables = [
        "chain_annotations", "chain_comments", "chains",
        "decision_history", "commitment_history",
        "dependencies", "commitments", "candidates",
        "arguments", "decisions", "discussions", "snapshots",
    ]
    for table in tables:
        conn.execute(f"DELETE FROM {table}")
    conn.execute("DELETE FROM projects WHERE id != 1")


def build():
    conn = sqlite3.connect(DATABASE)
    wipe(conn)

    def insert(table, **values):
        columns = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        conn.execute(
            f"INSERT INTO {table} ({columns}) VALUES ({marks})",
            tuple(values.values()),
        )

    # ---------- discussions ----------
    insert(
        "discussions", project_id=1,
        title="Week 1 — project kickoff",
        content=(
            "Alice decided to use PostgreSQL because payment transactions "
            "require transaction support. Alice decided to build a web app "
            "rather than a mini program because a browser version reaches "
            "everyone. Carol will design the database schema by 2026-12-01. "
            "Bob will set up the API server after the schema is ready."
        ),
    )
    insert(
        "discussions", project_id=1,
        title="Week 2 — caching choice",
        content=(
            "We decided to use Redis for caching because it scales well. "
            "Dora will set up the cache by 2026-12-10. Eve will write the "
            "integration tests by 2026-12-15."
        ),
    )
    insert(
        "discussions", project_id=1,
        title="Week 3 — styling and auth",
        content=(
            "Alice decided to use Tailwind for styling because it ships "
            "fast. Bob decided to use JWT for authentication."
        ),
    )

    # ---------- decisions ----------
    # d1: PostgreSQL (approved chain) — the classic README scenario
    insert(
        "decisions", project_id=1, source_discussion_id=1,
        title="Use PostgreSQL",
        rationale="payment transactions require transaction support",
        decided_by="Alice", status="CONFIRMED",
        teacher_status="APPROVED",
        created_at=T("2026-11-05T10:00:00+08:00"),
        chain_id=1, superseded_by_decision_id=None,
    )
    # d2: web app (held chain)
    insert(
        "decisions", project_id=1, source_discussion_id=1,
        title="Build a web app",
        rationale="a browser version reaches everyone",
        decided_by="Alice", status="CONFIRMED",
        teacher_status="HELD",
        created_at=T("2026-11-05T10:05:00+08:00"),
        chain_id=2, superseded_by_decision_id=None,
    )
    # d3: Redis (pending chain)
    insert(
        "decisions", project_id=1, source_discussion_id=2,
        title="Use Redis for caching",
        rationale="it scales well",
        decided_by=None, status="CONFIRMED",
        teacher_status="PENDING",
        created_at=T("2026-11-12T09:30:00+08:00"),
        chain_id=3, superseded_by_decision_id=None,
    )
    # d4: Tailwind (draft chain)
    insert(
        "decisions", project_id=1, source_discussion_id=3,
        title="Use Tailwind for styling",
        rationale="it ships fast",
        decided_by="Alice", status="CONFIRMED",
        teacher_status=None,
        created_at=T("2026-11-15T14:00:00+08:00"),
        chain_id=4, superseded_by_decision_id=None,
    )
    # d5: a free decision, not in any chain yet
    insert(
        "decisions", project_id=1, source_discussion_id=None,
        title="Use GitHub Actions for CI",
        rationale="the build should fail loudly",
        decided_by="Carol", status="CONFIRMED",
        teacher_status=None,
        created_at=T("2026-11-16T11:00:00+08:00"),
        chain_id=None, superseded_by_decision_id=None,
    )
    # d6: a second decision point on the PostgreSQL chain — approved
    # node-by-node by the supervisor.
    insert(
        "decisions", project_id=1, source_discussion_id=1,
        title="Use SQLite for the demo",
        rationale="the demo must run offline on teammates machines",
        decided_by="Alice", status="CONFIRMED",
        teacher_status="APPROVED",
        created_at=T("2026-11-14T16:00:00+08:00"),
        chain_id=1, superseded_by_decision_id=None,
    )

    # ---------- chains ----------
    insert(
        "chains", project_id=1, title="Use PostgreSQL",
        submitted_at=T("2026-11-08T18:00:00+08:00"),
        teacher_status="APPROVED",
        created_at=T("2026-11-05T10:00:00+08:00"),
    )
    insert(
        "chains", project_id=1, title="Build a web app",
        submitted_at=T("2026-11-09T17:30:00+08:00"),
        teacher_status="HELD",
        created_at=T("2026-11-05T10:05:00+08:00"),
    )
    insert(
        "chains", project_id=1, title="Use Redis for caching",
        submitted_at=T("2026-11-13T20:00:00+08:00"),
        teacher_status="PENDING",
        created_at=T("2026-11-12T09:30:00+08:00"),
    )
    insert(
        "chains", project_id=1, title="Use Tailwind for styling",
        submitted_at=None, teacher_status=None,
        created_at=T("2026-11-15T14:00:00+08:00"),
    )

    # ---------- chain comments (the chat-style discussion) ----------
    comments = [
        # PostgreSQL chain
        (1, 1, "Bob", "Migrations are harder with PostgreSQL, what about SQLite?", T("2026-11-05T10:20:00+08:00")),
        (2, 1, "Alice", "They are, but transactions decide it — payments need them.", T("2026-11-05T10:25:00+08:00")),
        (3, 1, "Carol", "Agreed, the schema design assumes transactions.", T("2026-11-05T10:30:00+08:00")),
        (4, 1, "Bob", "OK, convinced.", T("2026-11-05T10:32:00+08:00")),
        # web-app chain
        (5, 2, "Carol", "What about a WeChat mini program? Our users are all on WeChat.", T("2026-11-06T15:00:00+08:00")),
        (6, 2, "Alice", "A browser version reaches everyone, not just WeChat users.", T("2026-11-06T15:10:00+08:00")),
        (7, 2, "Carol", "Fair, but a mini program is easier to demo.", T("2026-11-06T15:12:00+08:00")),
        # Redis chain
        (8, 3, "Bob", "What about the ops cost of Redis?", T("2026-11-12T10:00:00+08:00")),
        (9, 3, "Dora", "Managed Redis keeps it low, and we cache heavily.", T("2026-11-12T10:15:00+08:00")),
        # Tailwind chain (draft)
        (10, 4, "Eve", "Utility classes everywhere look messy.", T("2026-11-15T14:20:00+08:00")),
        (11, 4, "Alice", "It ships fast — we can refactor the CSS later.", T("2026-11-15T14:30:00+08:00")),
    ]
    for cid, chain_id, author, text, created in comments:
        insert(
            "chain_comments", chain_id=chain_id, decision_id=1 if chain_id == 1 else None,
            author=author, text=text, created_at=created,
        )

    # ---------- teacher annotations ----------
    insert(
        "chain_annotations", chain_id=1, decision_id=1,
        text="Solid reasoning — the transaction requirement settles it. Proceed.",
        created_at=T("2026-11-08T19:00:00+08:00"),
    )
    insert(
        "chain_annotations", chain_id=2, decision_id=2,
        text="Bring a mini-program comparison to the next meeting — reach is not everything.",
        created_at=T("2026-11-09T18:00:00+08:00"),
    )

    # ---------- execution tasks (chain 1, approved) ----------
    insert(
        "commitments", project_id=1, decision_id=1, chain_id=1,
        owner="Carol", description="Design the database schema",
        due_date=None, status="COMPLETED",
    )
    insert(
        "commitments", project_id=1, decision_id=1, chain_id=1,
        owner="Bob", description="Build the API server",
        due_date=None, status="IN_PROGRESS",
    )
    insert(
        "commitments", project_id=1, decision_id=1, chain_id=1,
        owner="Eve", description="Write the integration tests",
        due_date=None, status="OPEN",
    )
    insert(
        "commitments", project_id=1, decision_id=1, chain_id=1,
        owner="Dora", description="Build the login page",
        due_date=None, status="IN_PROGRESS",
    )

    # dependency edges: Carol -> Bob -> {Eve, Dora}
    for pred, succ in [(1, 2), (2, 3), (2, 4)]:
        insert(
            "dependencies", project_id=1,
            predecessor_commitment_id=pred, successor_commitment_id=succ,
            dependency_type="BLOCKS",
        )

    # commitment history for realism
    insert(
        "commitment_history", commitment_id=1, old_status="OPEN",
        new_status="IN_PROGRESS", reason="schema design started",
        changed_at=T("2026-11-06T09:00:00+08:00"),
    )
    insert(
        "commitment_history", commitment_id=1, old_status="IN_PROGRESS",
        new_status="COMPLETED", reason="schema signed off",
        changed_at=T("2026-11-09T16:00:00+08:00"),
    )
    insert(
        "commitment_history", commitment_id=2, old_status="OPEN",
        new_status="IN_PROGRESS", reason="API scaffolding done",
        changed_at=T("2026-11-10T10:00:00+08:00"),
    )
    insert(
        "commitment_history", commitment_id=4, old_status="OPEN",
        new_status="IN_PROGRESS", reason="login page started early",
        changed_at=T("2026-11-11T13:00:00+08:00"),
    )

    # ---------- one pending candidate (Bob's JWT decision) ----------
    insert(
        "candidates", project_id=1, discussion_id=3,
        candidate_type="DECISION",
        payload=(
            '{"title": "Use JWT for authentication", '
            '"rationale": null, "decided_by": "Bob", '
            '"status": "CONFIRMED"}'
        ),
        source_text="Bob decided to use JWT for authentication.",
        status="PENDING", review_comment=None,
        created_at=T("2026-11-15T15:00:00+08:00"),
    )

    # a comment under the SQLite node (the second decision point)
    insert(
        "chain_comments", chain_id=1, decision_id=6,
        author="Alice", text="The demo must run offline — SQLite it is.",
        created_at=T("2026-11-14T16:10:00+08:00"),
    )

    conn.commit()
    conn.close()

    # refresh the pristine backup so demos start from this dataset
    shutil.copyfile(DATABASE, PRISTINE)
    print("demo dataset rebuilt; pristine backup refreshed")


if __name__ == "__main__":
    build()
