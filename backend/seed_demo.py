# -*- coding: utf-8 -*-
"""Build the full realistic demo dataset for DecisionTrace.

Two student groups, three weeks of activity, every state covered:

Project 1 — the DecisionTrace team itself:
- chain evolution (PostgreSQL approved & executing -> SQLite revision
  awaiting the supervisor's choice — the selection demo),
- a held chain with a supervisor annotation,
- a submitted chain awaiting a decision,
- two draft chains (EN + a Chinese one demonstrating CN extraction),
- free decisions, five execution tasks with dependencies and a real
  OUT OF ORDER check, two pending candidates with different makers.

Project 2 — a second group (Campus Navigation App) so the supervisor's
per-group dashboard shows both teams.

Usage:  python seed_demo.py   (from the backend directory)
Also refreshes decisiontrace.pristine.db so future demos start here.
"""
import shutil
import sqlite3

DATABASE = "decisiontrace.db"
PRISTINE = "decisiontrace.pristine.db"

T = lambda s: s  # ISO strings as-is


def wipe(conn):
    tables = [
        "chain_annotations", "chain_comments", "chains",
        "decision_history", "commitment_history",
        "dependencies", "commitments", "candidates",
"decisions", "discussions",
    ]
    for table in tables:
        conn.execute("DELETE FROM {0}".format(table))
    conn.execute("DELETE FROM projects")


def build():
    conn = sqlite3.connect(DATABASE)
    wipe(conn)

    def insert(table, **values):
        columns = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        conn.execute(
            "INSERT INTO {0} ({1}) VALUES ({2})".format(
                table, columns, marks
            ),
            tuple(values.values()),
        )

    # =================================================================
    # Project 1 — DecisionTrace (the team's own project)
    # =================================================================
    insert("projects", name="DecisionTrace Development",
           description="The course project: an AI decision analyst")

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
        title="Week 2 — caching and architecture",
        content=(
            "We decided to use Redis for caching because it scales well. "
            "Dora will set up the cache by 2026-12-10. Eve will write the "
            "integration tests by 2026-12-15. Carol asked whether the "
            "cache layer belongs in the API server or standalone."
        ),
    )
    insert(
        "discussions", project_id=1,
        title="Week 3 — styling, auth and tooling",
        content=(
            "Alice decided to use Tailwind for styling because it ships "
            "fast. Bob decided to use JWT for authentication. Eve decided "
            "to use Playwright for the E2E tests because it drives a real "
            "browser."
        ),
    )
    insert(
        "discussions", project_id=1,
        title="中文组会 — 抽取方案讨论",
        content=(
            "李静决定采用规则优先的抽取方案。我们决定把讨论文本作为系统记录,"
            "因为每条记录都必须能追溯到原文。"
        ),
    )

    decisions = [
        (1, 1, "Use PostgreSQL",
         "payment transactions require transaction support",
         "Alice", 1, "APPROVED", "2026-11-03T10:00:00+08:00"),
        (1, 1, "Build a web app",
         "a browser version reaches everyone",
         "Alice", 2, "HELD", "2026-11-03T10:05:00+08:00"),
        (1, 2, "Use Redis for caching",
         "it scales well",
         None, 3, "PENDING", "2026-11-10T09:30:00+08:00"),
        (1, 2, "Build a WeChat mini program first",
         "the comparison shows most users are on WeChat",
         "Carol", 2, "PENDING", "2026-11-07T16:00:00+08:00"),
        (1, 3, "Use Tailwind for styling",
         "it ships fast",
         "Alice", 4, None, "2026-11-13T14:00:00+08:00"),
        (1, 3, "Use JWT for authentication",
         "stateless sessions fit the API",
         "Bob", 5, None, "2026-11-13T14:10:00+08:00"),
        (1, 1, "Use SQLite for the demo",
         "the demo must run offline on teammates machines",
         "Alice", 1, "PENDING", "2026-11-15T16:00:00+08:00"),
        (1, 3, "Use Playwright for E2E tests",
         "it drives a real browser",
         "Eve", None, None, "2026-11-13T14:20:00+08:00"),
        (1, None, "Use GitHub Actions for CI",
         "the build should fail loudly",
         "Carol", None, None, "2026-11-16T11:00:00+08:00"),
        (1, 4, "规则优先的抽取方案",
         None,
         "李静", 6, None, "2026-11-17T10:00:00+08:00"),
        (1, 4, "把讨论文本作为系统记录",
         "每条记录都必须能追溯到原文",
         None, 6, None, "2026-11-17T10:05:00+08:00"),
    ]
    for project_id, discussion_id, title, rationale, maker, chain_id, verdict, created in decisions:
        insert(
            "decisions", project_id=project_id,
            source_discussion_id=discussion_id,
            title=title, rationale=rationale, decided_by=maker,
            status="CONFIRMED", teacher_status=verdict,
            created_at=T(created), chain_id=chain_id,
            superseded_by_decision_id=None,
        )

    chains = [
        (1, 1, "Use PostgreSQL", "2026-11-05T18:00:00+08:00", "2026-11-03T10:00:00+08:00"),
        (1, 2, "Build a web app", "2026-11-07T18:30:00+08:00", "2026-11-03T10:05:00+08:00"),
        (1, 3, "Use Redis for caching", "2026-11-11T20:00:00+08:00", "2026-11-10T09:30:00+08:00"),
        (1, 4, "Use Tailwind for styling", None, "2026-11-13T14:00:00+08:00"),
        (1, 5, "Use JWT for authentication", None, "2026-11-13T14:10:00+08:00"),
        (1, 6, "抽取方案", None, "2026-11-17T10:00:00+08:00"),
    ]
    for project_id, cid, title, submitted, created in chains:
        insert(
            "chains", project_id=project_id, title=title,
            submitted_at=T(submitted) if submitted else None,
            teacher_status=None, created_at=T(created),
        )

    comments = [
        (1, 1, "Bob", "Migrations are harder with PostgreSQL, what about SQLite?", "2026-11-03T10:20:00+08:00"),
        (1, 1, "Alice", "They are, but transactions decide it — payments need them.", "2026-11-03T10:25:00+08:00"),
        (1, 1, "Carol", "Agreed, the schema design assumes transactions.", "2026-11-03T10:30:00+08:00"),
        (1, 1, "Bob", "OK, convinced.", "2026-11-03T10:32:00+08:00"),
        (1, 6, "Alice", "The demo must run offline on teammates machines — SQLite it is.", "2026-11-15T16:10:00+08:00"),
        (1, 6, "Carol", "Then the schema stays compatible with PostgreSQL?", "2026-11-15T16:15:00+08:00"),
        (2, 2, "Carol", "What about a WeChat mini program? Our users are all on WeChat.", "2026-11-04T15:00:00+08:00"),
        (2, 11, "Carol", "The comparison shows most users are on WeChat — mini program first, web later.", "2026-11-07T16:10:00+08:00"),
        (2, 2, "Alice", "A browser version reaches everyone, not just WeChat users.", "2026-11-04T15:10:00+08:00"),
        (2, 2, "Carol", "Fair, but a mini program is easier to demo.", "2026-11-04T15:12:00+08:00"),
        (3, 3, "Bob", "What about the ops cost of Redis?", "2026-11-10T10:00:00+08:00"),
        (3, 3, "Dora", "Managed Redis keeps it low, and we cache heavily.", "2026-11-10T10:15:00+08:00"),
        (3, 3, "Bob", "OK — but let us document the cache invalidation rules.", "2026-11-10T10:20:00+08:00"),
        (4, 4, "Eve", "Utility classes everywhere look messy.", "2026-11-13T14:20:00+08:00"),
        (4, 4, "Alice", "It ships fast — we can refactor the CSS later.", "2026-11-13T14:30:00+08:00"),
        (5, 5, "Carol", "Refresh tokens add complexity — do we need them?", "2026-11-13T15:00:00+08:00"),
        (6, 9, "李静", "规则先跑,LLM 只在配置了密钥时启用,这样演示永远可用。", "2026-11-17T10:20:00+08:00"),
        (6, 10, "李静", "每条记录都锚定原文句子,追溯才站得住。", "2026-11-17T10:25:00+08:00"),
    ]
    for chain_id, node_id, author, text, created in comments:
        insert(
            "chain_comments", chain_id=chain_id, decision_id=node_id,
            author=author, text=text, created_at=T(created),
        )

    insert(
        "chain_annotations", chain_id=1, decision_id=1,
        text="Solid reasoning — the transaction requirement settles it. Proceed.",
        created_at=T("2026-11-05T19:00:00+08:00"),
    )
    insert(
        "chain_annotations", chain_id=2, decision_id=2,
        text="Bring a mini-program comparison to the next meeting — reach is not everything.",
        created_at=T("2026-11-06T18:00:00+08:00"),
    )

    tasks = [
        (1, "Carol", "Design the database schema", "COMPLETED"),
        (1, "Bob", "Build the API server", "IN_PROGRESS"),
        (1, "Eve", "Write the integration tests", "OPEN"),
        (1, "Dora", "Build the login page", "IN_PROGRESS"),
        (1, "Frank", "Write the offline demo docs", "OPEN"),
    ]
    for decision_id, owner, description, status in tasks:
        insert(
            "commitments", project_id=1, decision_id=decision_id, chain_id=1,
            owner=owner, description=description, due_date=None, status=status,
        )

    for pred, succ in [(1, 2), (2, 3), (2, 4), (2, 5)]:
        insert(
            "dependencies", project_id=1,
            predecessor_commitment_id=pred, successor_commitment_id=succ,
            dependency_type="BLOCKS",
        )

    history = [
        (1, "OPEN", "IN_PROGRESS", "schema design started", "2026-11-04T09:00:00+08:00"),
        (1, "IN_PROGRESS", "COMPLETED", "schema signed off", "2026-11-07T16:00:00+08:00"),
        (2, "OPEN", "IN_PROGRESS", "API scaffolding done", "2026-11-08T10:00:00+08:00"),
        (4, "OPEN", "IN_PROGRESS", "login page started early", "2026-11-09T13:00:00+08:00"),
        (3, "OPEN", "OPEN", "blocked: waiting on the API server", "2026-11-09T13:05:00+08:00"),
    ]
    for cid, old, new, reason, changed in history:
        insert(
            "commitment_history", commitment_id=cid, old_status=old,
            new_status=new, reason=reason, changed_at=T(changed),
        )

    insert(
        "candidates", project_id=1, discussion_id=3,
        candidate_type="DECISION",
        payload='{"title": "Use JWT for authentication", "rationale": null, "decided_by": "Bob", "status": "CONFIRMED"}',
        source_text="Bob decided to use JWT for authentication.",
        status="PENDING", review_comment=None,
        created_at=T("2026-11-13T15:00:00+08:00"),
    )
    insert(
        "candidates", project_id=1, discussion_id=3,
        candidate_type="DECISION",
        payload='{"title": "Use Playwright for E2E tests", "rationale": "it drives a real browser", "decided_by": "Eve", "status": "CONFIRMED"}',
        source_text="Eve decided to use Playwright for the E2E tests because it drives a real browser.",
        status="PENDING", review_comment=None,
        created_at=T("2026-11-13T15:05:00+08:00"),
    )

    # =================================================================
    # Project 2 — Campus Navigation App
    # =================================================================
    insert("projects", name="Campus Navigation App",
           description="A map app for freshmen to find buildings")

    insert(
        "discussions", project_id=2,
        title="Week 2 — platform choice",
        content=(
            "Mia decided to use React Native because one codebase covers "
            "both platforms. Leo decided to use Mapbox for the maps "
            "because it renders indoor floors. Mia will set up the "
            "project scaffold by 2026-12-05. Leo will build the map "
            "screen after the scaffold is ready."
        ),
    )

    insert(
        "decisions", project_id=2, source_discussion_id=5,
        title="Use React Native",
        rationale="one codebase covers both platforms",
        decided_by="Mia", status="CONFIRMED",
        teacher_status="APPROVED",
        created_at=T("2026-11-10T09:00:00+08:00"),
        chain_id=7, superseded_by_decision_id=None,
    )
    insert(
        "decisions", project_id=2, source_discussion_id=5,
        title="Use Mapbox for the maps",
        rationale="it renders indoor floors",
        decided_by="Leo", status="CONFIRMED",
        teacher_status="PENDING",
        created_at=T("2026-11-10T09:05:00+08:00"),
        chain_id=8, superseded_by_decision_id=None,
    )

    insert(
        "chains", project_id=2, title="Use React Native",
        submitted_at=T("2026-11-12T19:00:00+08:00"),
        teacher_status=None, created_at=T("2026-11-10T09:00:00+08:00"),
    )
    insert(
        "chains", project_id=2, title="Use Mapbox for the maps",
        submitted_at=T("2026-11-13T20:00:00+08:00"),
        teacher_status=None, created_at=T("2026-11-10T09:05:00+08:00"),
    )

    insert(
        "chain_comments", chain_id=7, decision_id=11,
        author="Nina", text="React Native vs Flutter — did we compare?",
        created_at=T("2026-11-10T10:00:00+08:00"),
    )
    insert(
        "chain_comments", chain_id=7, decision_id=11,
        author="Mia", text="Flutter needs Dart, the team already knows JS.",
        created_at=T("2026-11-10T10:10:00+08:00"),
    )
    insert(
        "chain_comments", chain_id=8, decision_id=12,
        author="Omar", text="Mapbox pricing for campus scale?",
        created_at=T("2026-11-12T14:00:00+08:00"),
    )

    insert(
        "chain_annotations", chain_id=7, decision_id=11,
        text="Good — keep the JS ecosystem. Proceed with the scaffold.",
        created_at=T("2026-11-12T20:00:00+08:00"),
    )

    insert(
        "commitments", project_id=2, decision_id=11, chain_id=7,
        owner="Mia", description="Set up the project scaffold",
        due_date=None, status="COMPLETED",
    )
    insert(
        "commitments", project_id=2, decision_id=11, chain_id=7,
        owner="Leo", description="Build the map screen",
        due_date=None, status="IN_PROGRESS",
    )
    insert(
        "dependencies", project_id=2,
        predecessor_commitment_id=6, successor_commitment_id=7,
        dependency_type="BLOCKS",
    )
    insert(
        "commitment_history", commitment_id=6, old_status="OPEN",
        new_status="COMPLETED", reason="scaffold ready",
        changed_at=T("2026-11-14T17:00:00+08:00"),
    )
    insert(
        "commitment_history", commitment_id=7, old_status="OPEN",
        new_status="IN_PROGRESS", reason="map screen started",
        changed_at=T("2026-11-15T10:00:00+08:00"),
    )

    conn.commit()
    conn.close()

    shutil.copyfile(DATABASE, PRISTINE)
    print("full demo dataset rebuilt; pristine backup refreshed")


if __name__ == "__main__":
    build()
