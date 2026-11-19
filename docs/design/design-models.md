# Design Models

Part II design document — DecisionTrace

**Status:** Current (2026-11-19) — matches the repositioned system.

## 1. Class Diagram

```mermaid
classDiagram
    class Project {
        +int id
        +str name
        +str description
    }
    class Discussion {
        +int id
        +int project_id
        +str title
        +str content
        +datetime created_at
    }
    class Candidate {
        +int id
        +int project_id
        +int discussion_id
        +str candidate_type
        +json payload
        +str source_text
        +str status
        +str review_comment
        +datetime created_at
    }
    class Decision {
        +int id
        +int project_id
        +int source_discussion_id
        +str title
        +str rationale
        +str decided_by
        +str status
        +int superseded_by_decision_id
        +str teacher_status
        +int chain_id
        +datetime created_at
    }
    class Chain {
        +int id
        +int project_id
        +str title
        +datetime submitted_at
        +datetime created_at
        +str teacher_status <<derived>>
    }
    class ChainComment {
        +int id
        +int chain_id
        +int decision_id
        +str author
        +str text
        +datetime created_at
    }
    class ChainAnnotation {
        +int id
        +int chain_id
        +int decision_id
        +str text
        +datetime created_at
    }
    class Commitment {
        +int id
        +int project_id
        +int chain_id
        +int decision_id
        +str owner
        +str description
        +datetime due_date
        +str status
    }
    class Dependency {
        +int id
        +int project_id
        +int predecessor_commitment_id
        +int successor_commitment_id
        +str dependency_type
    }
    class CommitmentHistory {
        +int commitment_id
        +str old_status
        +str new_status
        +str reason
        +datetime changed_at
    }
    class DecisionHistory {
        +int decision_id
        +str old_title
        +str new_title
        +str old_rationale
        +str new_rationale
        +str old_status
        +str new_status
        +str reason
        +datetime changed_at
    }

    Project "1" --> "*" Discussion : has
    Discussion "1" --> "*" Candidate : extracted from
    Candidate "0..1" --> "0..1" Decision : confirmed to
    Project "1" --> "*" Decision : has
    Project "1" --> "*" Chain : has
    Chain "0..1" --> "*" Decision : nodes
    Decision "0..1" --> "*" ChainComment : discussed under
    Decision "0..1" --> "*" ChainAnnotation : annotated
    Chain "1" --> "*" Commitment : executes via
    Decision "1" --> "*" Commitment : anchors
    Commitment "1" --> "*" Dependency : blocks
    Commitment "1" --> "*" CommitmentHistory : logs
    Decision "1" --> "*" DecisionHistory : logs
```

`superseded_by_decision_id` is a legacy column: it stays in the schema
for rows created before the repositioning, and the current system never
writes it (the chain itself is the revision relationship — data-model.md).

## 2. Sequence Diagram: Discussion → Chain → Verdict → Execution

```mermaid
sequenceDiagram
    participant S as Student group
    participant UI as DecisionTrace UI
    participant API as Backend API
    participant T as Supervisor

    S->>UI: paste meeting text (or import file)
    UI->>API: POST /discussions
    S->>UI: run extraction (an import triggers it automatically)
    API-->>UI: decision candidates (with source sentences)
    S->>UI: confirm / edit / reject (per maker)
    API-->>UI: decisions created
    S->>UI: start a chain from a decision, discuss per node, append revisions
    API-->>UI: chain detail (nodes + threads)
    S->>UI: submit the chain
    API-->>UI: latest verdict-less node → PENDING
    T->>UI: awaiting view shows the whole chain inline
    T->>UI: annotate a node / approve node X
    API-->>API: other pending/held nodes → REJECTED
    API-->>UI: node X APPROVED, chain locked
    S->>UI: execution: add tasks to node X
    API-->>UI: tasks, topological order, AI checks
    T->>UI: in-progress view: read-only boards per group
```

## 3. Sequence Diagram: Node States and the Out-of-Order Check

```mermaid
sequenceDiagram
    participant S as Student
    participant API as Backend

    S->>API: POST /chains/{id}/tasks {owner, description, decision_id}
    API-->>S: task bound to the approved decision
    S->>API: PATCH /commitments/{id}/status (OPEN → IN_PROGRESS)
    API-->>S: history appended
    API-->>S: GET /chains/{id}/execution?decision_id=
    Note over API: computes states on read:<br/>WAITING / READY / BLOCKED / DONE / CYCLIC
    API-->>S: checks: cycle? blocked chain? out-of-order start?
```

## 4. Where the Models Live

The class diagram is the SQLAlchemy models in
`backend/app/models/` (`chain.py`, `decision.py`, `commitment.py`,
`dependency.py`, `discussion.py`, `candidate.py` and the two history
tables), documented in `docs/design/data-model.md`. Derived values —
chain status, node states, topological order, checks, display
numbering — have no tables by design (A8).
