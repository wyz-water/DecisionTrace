# Data Model Design

Part II design document — DecisionTrace

**Status:** Current (matches the implementation, 2026-11-19)

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    PROJECT ||--o{ DISCUSSION : has
    PROJECT ||--o{ DECISION : has
    PROJECT ||--o{ CHAIN : has

    DISCUSSION ||--o{ CANDIDATE : extracted-from
    CANDIDATE ||--o| DECISION : confirmed-to

    DECISION }o--|| CHAIN : node-of
    DECISION ||--o{ CHAIN_COMMENT : discussed-under
    DECISION ||--o{ CHAIN_ANNOTATION : annotated

    CHAIN ||--o{ CHAIN_COMMENT : has
    CHAIN ||--o{ CHAIN_ANNOTATION : has
    CHAIN ||--o{ COMMITMENT : executes-via

    COMMITMENT ||--o{ DEPENDENCY : blocks
    DEPENDENCY }o--|| COMMITMENT : successor
    COMMITMENT ||--o{ COMMITMENT_HISTORY : logs
    DECISION ||--o{ DECISION_HISTORY : logs
```

## 2. Core Entities

### Project (the student group)

`id, name, description` — the supervisor supervises many projects; every
view on the supervisor side groups by project.

### Discussion (the source text)

`id, project_id, title, content, created_at` — pasted or imported meeting
text. The system of record: every decision links back to its source
discussion.

### Candidate (the AI's proposal, before the human gate)

`id, project_id, discussion_id, candidate_type, payload (JSON), source_text, status (PENDING/CONFIRMED/REJECTED), review_comment, created_at`

`candidate_type` is `DECISION` only: the repositioned system extracts
decisions; tasks come from the chain discussion, not extraction.

### Decision (one decision point)

`id, project_id, source_discussion_id, title, rationale, decided_by, status (CONFIRMED/SUPERSEDED/REVOKED), superseded_by_decision_id, chain_id, created_at`

- `decided_by` — named-person patterns (EN + ZH); team decisions stay
  null. Per-maker color coding and the "review only mine" filter hang on
  this field.
- `chain_id` — a decision either stands alone or is a node of one chain.
- **`teacher_status`** — the supervisor's verdict on this point:
  `null` (no verdict), `PENDING` (submitted, awaiting), `APPROVED`
  (the selected point — it enters execution), `HELD`, `REJECTED`
  (overruled by the approval of another point). Students never write it.
- `superseded_by_decision_id` — kept for history but unused by the chain
  model (the chain itself is the revision relationship).

### Chain (one topic's decision history)

`id, project_id, title, submitted_at, created_at`

`teacher_status` is **derived on read, never stored**:
- `APPROVED` — some node is approved (the supervisor chose it);
- `PENDING` — submitted but no approval yet;
- `null` — a draft in discussion.

Invariants:
1. A chain has at most one approved node. Approving a node sets the
   chain's other `PENDING`/`HELD`/`APPROVED` nodes to `REJECTED`.
2. An approved chain is locked: no further nodes can be appended.

### ChainComment (the discussion under one node)

`id, chain_id, decision_id, author, text, created_at` — chat-style. Each
node carries its own thread (`decision_id` is the anchor).

### ChainAnnotation (the supervisor's notes)

`id, chain_id, decision_id (nullable), text, created_at` — annotations
may target any decision point of the chain (`decision_id`) or the chain
as a whole (null).

### Commitment (a task from the execution phase)

`id, project_id, chain_id, decision_id, owner, description, due_date, status (OPEN/IN_PROGRESS/COMPLETED/DELAYED/BLOCKED)`

Tasks exist only for an **approved** decision; `decision_id` is the
anchor, `chain_id` keeps the provenance.

### Dependency

`id, project_id, predecessor_commitment_id, successor_commitment_id, dependency_type (BLOCKS)` — read-only in the current milestone: edges come from the demo data, and the execution checks (cycle / blocked / out-of-order) run against them on every read. Create/remove endpoints were removed in the repositioning cleanup (open issue).

### History tables (append-only)

- `CommitmentHistory` — status changes with reason and timestamp.
- `DecisionHistory` — title/status/rationale changes with reason.

## 3. Derived, Never Stored

- **Node state** (`WAITING` / `READY` / `BLOCKED` / `DONE`) — computed
  from the dependency edges and statuses.
- **Topological order, cycles** — computed from the edges.
- **AI checks** — cycle / blocked-chain / out-of-order, computed on
  read.
- **Chain status** — derived from the nodes' verdicts (see above).
- **Display numbering** — project-scoped: chains are `#1..#N` by their
  first decision's time, nodes render `#chain-node` (`#1-2`), free
  decisions `#1..#M`. Global database ids never appear in the UI.

## 4. What Was Removed

The repositioning deleted the `Argument`, `Snapshot` and `Impact`
concepts (and their tables): the supervisor/chain/execution model
replaced the deliberation layer, and the chain itself is the meeting
artifact — no graph snapshots.
