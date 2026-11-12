# Data Model Design

Part II design document — DecisionTrace

**Status:** Draft for team review (2026-11-04)

The core idea is four concepts — **Decision, Commitment, Dependency,
Change** — plus the intake pipeline around them (Discussion → Candidate).
This revision adds a fifth concept, **Argument**: the pros and cons
behind each decision, so a decision keeps the deliberation that produced
it, not just its conclusion. History tables make change a first-class
citizen: nothing is edited in place, every modification appends a row.

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    Project ||--o{ Discussion : has
    Project ||--o{ Decision : has
    Project ||--o{ Commitment : has
    Project ||--o{ Dependency : has
    Project ||--o{ Candidate : has
    Project ||--o{ Argument : has

    Discussion ||--o{ Decision : "source of"
    Discussion ||--o{ Candidate : "extracted from"
    Discussion ||--o{ Argument : "source of"

    Decision ||--o{ Commitment : "drives"
    Decision ||--o{ DecisionHistory : "change log"
    Decision ||--o{ Argument : "deliberated by"

    Commitment ||--o{ CommitmentHistory : "change log"
    Commitment ||--o{ Dependency : "predecessor of"
    Commitment ||--o{ Dependency : "successor of"

    PROJECT {
        int id PK
        string name
        string description
    }
    DISCUSSION {
        int id PK
        int project_id FK
        string title
        text content
    }
    DECISION {
        int id PK
        int project_id FK
        int source_discussion_id FK
        string title
        text rationale
        string status
        datetime created_at
    }
    COMMITMENT {
        int id PK
        int project_id FK
        int decision_id FK
        string owner
        text description
        date due_date
        string status
    }
    DEPENDENCY {
        int id PK
        int project_id FK
        int predecessor_commitment_id FK
        int successor_commitment_id FK
        string dependency_type
    }
    CANDIDATE {
        int id PK
        int project_id FK
        int discussion_id FK
        string candidate_type
        json payload
        text source_text
        string status
        string review_comment
        datetime created_at
    }
    ARGUMENT {
        int id PK
        int project_id FK
        int discussion_id FK
        int decision_id FK
        string stance
        text claim
        string author
        text source_text
        string status
        text resolved_reason
        datetime created_at
    }
    DECISION_HISTORY {
        int id PK
        int decision_id FK
        string old_title
        string new_title
        text old_rationale
        text new_rationale
        string old_status
        string new_status
        text reason
        datetime changed_at
    }
    COMMITMENT_HISTORY {
        int id PK
        int commitment_id FK
        string old_status
        string new_status
        text reason
        datetime changed_at
    }
```

## 2. Table Notes

### Project
The workspace. The frontend keeps the active project in `localStorage`
(`decisiontrace.activeProjectId`) and reloads the dashboard on switch.
Deleting a project cascades through every child table (children first:
histories, edges, then records).

### Discussion
Raw meeting notes or chat transcripts (UC01), entered by paste or
`.txt`/`.md` upload (decoded UTF-8 first, GBK fallback — the team's
notes are mixed). Discussions are the *source context* every authoritative
record points back to.

### Decision
A decision with its rationale — the recorded *decision goal* (UC04).
`source_discussion_id` is nullable: a decision can be created directly,
not only extracted. If its source discussion is deleted, the pointer is
cleared and the decision stays. The rationale is required for manually
created decisions (API and form) and may be changed but never erased by
revision; decisions confirmed from a candidate may lack one, because
their goal context is the source discussion they point back to. Every
revision writes the old and the new rationale to `decision_history`, so
the goal's evolution is preserved.

**Status:** `CONFIRMED` | `SUPERSEDED` | `REVOKED`

### Argument
A point made during the deliberation of a decision (the *deliberation
layer*): `stance` is `FOR` or `AGAINST`, `claim` is what was said,
`author` who said it, and `decision_id` which decision it targets (null
when the extraction could not link it — a free-standing concern).
`source_text` keeps the original sentence, so every argument can be
traced back to the discussion it came from. Arguments pass through the
same candidate gate as every other record (A2).

**Status:** `OPEN` | `RESOLVED` — resolving requires a reason, stored in
`resolved_reason`; append-only argument history is a Part III item.

A decision with at least one `OPEN` `AGAINST` argument is **contested** —
computed on read, never a manual status (A13).

### Commitment
Who promised what, by when (UC05). `due_date` feeds overdue highlighting
in the overview and plan views.

**Status:** `OPEN` | `IN_PROGRESS` | `COMPLETED` | `DELAYED` | `BLOCKED`

### Dependency
A directed edge between two commitments (UC06). `dependency_type` is
`BLOCKS` today (the only semantics the graph algorithms need); the
column leaves room for other relations.

### Candidate
The AI intake pipeline (UC02/UC03). `payload` is JSON holding the
extraction result (decision fields, commitment fields, the two
commitment owners of a dependency candidate, or an argument's
stance/claim/author/target). A candidate is the only route to an
authoritative record from text.

**Status:** `PENDING` | `CONFIRMED` | `REJECTED`

### DecisionHistory / CommitmentHistory
Append-only change logs. Every `PATCH` writes one row: old value, new
value, and a human `reason`. Audit-trail views read these newest-first.

## 3. Derived Structures (computed, never stored)

| Structure | Definition | Where computed |
|---|---|---|
| Graph | nodes = commitments, edges = dependencies | `services/graph.py` |
| Topological order | Kahn's algorithm over the graph | `services/graph.py` |
| Cycles | nodes that cannot be ordered | `services/graph.py` |
| Impact set | transitive closure over `BLOCKS` edges starting at a commitment/decision | `services/graph.py` |
| Consistency conflicts | order violations (e.g. completed before its predecessor) and duplicates | `services/consistency.py` |
| Contested set | decisions with ≥ 1 `OPEN` `AGAINST` argument | `services/deliberation.py` |
| Decision health | overturn rate, avg lifespan of overturned decisions, revision rate, contested rate, objection resolution rate — from history + arguments, never stored | `services/retrospective.py` |

They are computed on read (decision A8) so there is no cache to
invalidate when a dependency changes.
