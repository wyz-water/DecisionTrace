# Design Models

Part II design document — DecisionTrace

**Status:** Draft for team review (2026-11-12)

Class and interaction models of the design. The class diagram is the
implemented data model (see `data-model.md` for the ER form and table
notes); the sequence diagrams cover the three flows that carry the
product's promise: intake, deliberation, and consequence. All three are
implemented and tested; the diagrams describe what the code does, not a
wish list.

## 1. Class Diagram

```mermaid
classDiagram
    class Project {
        +int id
        +string name
        +string description
    }

    class Discussion {
        +int id
        +int project_id
        +string title
        +string content
    }

    class Decision {
        +int id
        +int project_id
        +int source_discussion_id
        +string title
        +string rationale
        +string status
        +datetime created_at
    }

    class DecisionHistory {
        +int id
        +int decision_id
        +string old_title
        +string new_title
        +string old_rationale
        +string new_rationale
        +string old_status
        +string new_status
        +string reason
        +datetime changed_at
    }

    class Commitment {
        +int id
        +int project_id
        +int decision_id
        +string owner
        +string description
        +date due_date
        +string status
    }

    class CommitmentHistory {
        +int id
        +int commitment_id
        +string old_status
        +string new_status
        +string reason
        +datetime changed_at
    }

    class Dependency {
        +int id
        +int project_id
        +int predecessor_commitment_id
        +int successor_commitment_id
        +string dependency_type
    }

    class Candidate {
        +int id
        +int project_id
        +int discussion_id
        +string candidate_type
        +json payload
        +string source_text
        +string status
        +string review_comment
        +datetime created_at
    }

    class Argument {
        +int id
        +int project_id
        +int discussion_id
        +int decision_id
        +string stance
        +string claim
        +string author
        +string source_text
        +string status
        +string resolved_reason
        +datetime created_at
    }

    class Snapshot {
        +int id
        +int project_id
        +string title
        +json graph_payload
        +datetime created_at
    }

    Project "1" --> "*" Discussion : has
    Project "1" --> "*" Decision : has
    Project "1" --> "*" Commitment : has
    Project "1" --> "*" Dependency : has
    Project "1" --> "*" Candidate : has
    Project "1" --> "*" Argument : has
    Project "1" --> "*" Snapshot : has

    Discussion "1" --> "*" Candidate : extracted from
    Discussion "1" --> "0..*" Decision : source of
    Discussion "1" --> "0..*" Argument : source of

    Decision "1" --> "*" DecisionHistory : change log
    Decision "1" --> "0..*" Commitment : drives
    Decision "1" --> "0..*" Argument : deliberated by

    Commitment "1" --> "*" CommitmentHistory : change log
    Commitment "1" --> "0..*" Dependency : predecessor of
    Commitment "1" --> "0..*" Dependency : successor of

    Candidate "0..1" --> Decision : confirms into
    Candidate "0..1" --> Commitment : confirms into
    Candidate "0..1" --> Dependency : confirms into
    Candidate "0..1" --> Argument : confirms into
```

Notes:

- **The candidate gate is the only route from text to authority.** Every
  record type confirms through `Candidate` (A2); the diagram shows all
  four `confirms into` edges deliberately.
- **Change is an object.** Both history classes are first-class; nothing
  is edited in place except argument resolution, which is a recorded
  state transition with a required reason (append-only argument history
  is a Part III item, risk R6).
- **`Argument.decision_id` is nullable**: a free-standing concern is a
  valid argument that no decision points to yet; it stays visible in the
  deliberation view.
- `Snapshot.graph_payload` stores the captured graph (nodes and edges)
  of one meeting; argument state in snapshots is open (R7).

## 2. Sequence Diagram: Discussion Intake and Review (UC01–UC03)

```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend
    participant DB as SQLite

    User->>UI: paste or upload discussion (.txt/.md/.docx/.pdf)
    UI->>API: POST /discussions
    API->>DB: insert Discussion
    API-->>UI: discussion + rule-based summary
    UI->>API: POST /candidates/extract/{id}
    alt DEEPSEEK_API_KEY set
        API->>API: LLM extraction
    else
        API->>API: rule extraction (EN + ZH patterns)
    end
    API->>DB: insert Candidates (PENDING, source sentence)
    API-->>UI: candidates + summary (idempotent re-extraction)
    UI-->>User: review queue: confirm / edit / reject
    User->>UI: batch confirm
    UI->>API: POST /candidates/confirm-batch
    API->>API: duplicate / cycle / target checks per item
    API->>DB: insert Decision / Commitment / Dependency / Argument
    API-->>UI: per-item results (partial failures reported)
```

The human's job is the review step only: reading highlighted source
sentences and confirming, editing or rejecting (A9, rule 3 of §5).

## 3. Sequence Diagram: Deliberation Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend
    participant DB as SQLite

    User->>UI: confirm ARGUMENT candidate (AGAINST, target "using Redis")
    UI->>API: POST /candidates/{id}/confirm
    API->>API: resolve target by title (prefix-tolerant)
    API->>DB: insert Argument (OPEN, decision_id, source sentence)
    UI->>API: GET /decisions/{id}/deliberation
    API->>DB: read the decision's arguments
    API->>API: contested = any OPEN AGAINST (computed, A13)
    API-->>UI: arguments + contested: true
    UI-->>User: contested badge, deliberation panel, attention entry
    User->>UI: resolve objection with a reason
    UI->>API: PATCH /arguments/{id} {status: RESOLVED, reason}
    API->>DB: update status + resolved_reason
    UI->>API: refresh (GET /decisions/{id}/deliberation)
    API-->>UI: contested: false
```

Contested is never stored: both reads compute it from the arguments, so
the badge cannot drift from the objections that justify it (§6).

## 4. Sequence Diagram: Status Change and Consequence (UC05, UC07)

```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend
    participant API as Backend
    participant DB as SQLite

    User->>UI: update a commitment's status (with reason)
    UI->>API: PATCH /commitments/{id}/status
    API->>DB: insert CommitmentHistory(old, new, reason)
    API->>DB: update the status (one transaction)
    API-->>UI: updated commitment
    User->>UI: open impact
    UI->>API: GET /commitments/{id}/impact
    API->>DB: read graph edges
    API->>API: transitive closure over BLOCKS
    API-->>UI: downstream commitments
    User->>UI: preview a hypothetical status
    UI->>API: GET /commitments/{id}/what-if?status=DELAYED
    API->>API: closure for the hypothetical state (read-only)
    API-->>UI: newly vs already affected — nothing written
```

History and update commit together; the what-if preview never writes a
history row, so previewing is safe (C6).

## 5. Where the Models Live

| Diagram element | Code |
|---|---|
| Classes | `backend/app/models/` (SQLAlchemy) + `backend/app/schemas/` (API shapes) |
| Extraction step | `backend/app/services/extractor.py` (rules + optional DeepSeek) |
| Contested computation | `backend/app/services/deliberation.py` |
| Closure / cycles / order | `backend/app/services/graph.py` |
| Decision health | `backend/app/services/retrospective.py` |
