# API Specification

Part II design document — DecisionTrace

**Status:** Current (matches the implementation, 2026-11-19)
**Base URL:** `http://127.0.0.1:8000` (development)
**Style:** JSON over REST; FastAPI generates OpenAPI docs at `/docs`.

The API mirrors the repositioned system: one supervisor supervising many
student groups. Everything the supervisor and the students do goes
through these endpoints; the execution phase only exists for decisions
the supervisor approved.

## 1. Conventions

### Pagination envelope

Every list endpoint returns:

```json
{ "items": [], "total": 0, "limit": 20, "offset": 0, "has_more": false }
```

Query parameters: `limit` (1–100, default 20), `offset` (default 0).
The frontend consumes this through one hook (`usePagedList`).

### Errors

- `404` — `{"detail": "<Entity> not found"}`
- `400` — a business-rule refusal (see the verdict and chain rules below)
- `422` — request shape

### Mutations

- `POST` creates, returns the created record.
- `PATCH` updates status/title/rationale and appends a history row where
  the entity has one (decisions, commitments).

## 2. Projects

| Method | Path | Notes |
|---|---|---|
| `POST` | `/projects` | Create a group (name, description). |
| `GET` | `/projects` | All groups — the supervisor's dashboard groups by these. |
| `DELETE` | `/projects/{id}` | Cascade-deletes the group's discussions, decisions, chains, tasks, history. |

## 3. Discussions (student intake)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/discussions` | Paste a meeting text (title, content). |
| `POST` | `/discussions/import` | `.txt/.md/.docx/.pdf` import, UTF-8 with GBK fallback; the frontend triggers extraction on the imported discussion immediately (one flow). |
| `GET` | `/discussions?project_id=` | Paged. |
| `DELETE` | `/discussions/{id}` | |

## 4. Candidates (the AI gate)

The AI (rule engine first, optional LLM path) never writes records — it
proposes candidates with the exact source sentence; a human confirms,
edits or rejects.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/candidates/extract/{discussion_id}` | Run extraction on one discussion. Returns DECISION candidates with source sentences. Pasted discussions use this explicit action; imported files extract automatically. |
| `GET` | `/candidates?project_id=&status=` | Paged; `status=PENDING` or `CONFIRMED,REJECTED`. |
| `PATCH` | `/candidates/{id}` | Edit a candidate before confirming. |
| `POST` | `/candidates/{id}/confirm` | Create the real decision. (Chains are started from existing decisions, see `/chains`.) |
| `POST` | `/candidates/{id}/reject` | |

Pending candidates carry a computed `duplicate_of` field (e.g.
`Decision #3`) when they repeat an existing decision; the title
matching tolerates the extractor's cleaning ("Use Redis" ≡ "Redis").

## 5. Decisions

| Method | Path | Notes |
|---|---|---|
| `POST` | `/decisions` | Manual creation (fallback, not the path). |
| `GET` | `/decisions?project_id=` | Paged. Includes `teacher_status` and `created_at`. |
| `PATCH` | `/decisions/{id}` | Title/rationale/status/`decided_by`; appends a history row. |
| `GET` | `/decisions/{id}/history` | Paged history. |

`Decision.teacher_status` is the **supervisor's verdict on this decision
point** (null until the chain is submitted, then `PENDING` /
`APPROVED` / `HELD` / `REJECTED`). It is never set by the students. A
free decision keeps `teacher_status = null` until it is chained.
`superseded_by_decision_id` is kept in stored rows for
pre-repositioning history and is no longer writable.

## 6. Chains (decision discussion + submission)

A chain is one topic's decision history: nodes are decision versions,
each node carries its own discussion, and the supervisor decides per
node.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/chains` | Start a chain from an existing free decision. |
| `GET` | `/chains?project_id=&submitted_only=` | Paged. `teacher_status` is derived: `APPROVED` when any node is approved (the supervisor's choice), `PENDING` when submitted without one, `null` for drafts. |
| `GET` | `/chains/{id}` | Detail: nodes (with `teacher_status`), comments, annotations. |
| `POST` | `/chains/{id}/nodes` | Append a revision decision. Refused 400 once the chain has an approved node (it is in execution and locked). |
| `POST` | `/chains/{id}/comments` | Add a discussion message under a node (`decision_id` optional). |
| `POST` | `/chains/{id}/submit` | Submit to the supervisor: the latest verdict-less node becomes `PENDING`. Re-submission is allowed (the chain is never frozen before approval) and updates the timestamp; when every node already carries a verdict, nothing becomes `PENDING` and the chain stays `PENDING` until a revision is appended and submitted. An approved chain returns 400 (locked, no re-submission). |

### `POST /chains/{id}/teacher-action` — the supervisor's verdict

```json
{ "status": "APPROVED" | "HELD" | "REJECTED" | null,
  "note": "annotation text or null",
  "decision_id": 6 }
```

- The verdict applies to the decision point named by `decision_id`
  (default: the chain's newest node). Annotations with `status: null`
  are pure annotations and may target any node.
- **Approval is a selection.** Approving one node overrules the chain's
  other pending/held nodes — they become `REJECTED`; nodes with no
  verdict are untouched. A chain has at most one approved point, and
  that point enters the execution phase.
- **Approval is final.** A verdict on an already-approved chain is
  refused with 400 (the chain is locked; R4's reopening is a Part III
  candidate). Pure annotations (`status: null`) remain allowed on any
  node.

## 7. Execution (only after approval)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/chains/{id}/tasks` | Add a task to an approved decision node (400 otherwise). |
| `GET` | `/chains/{id}/execution?decision_id=` | Tasks of that decision (position, computed state, blockers), the dependency edges, the topological order, cycles, and AI checks (cycle / blocked / out-of-order). |
| `PATCH` | `/commitments/{id}/status` | Status change with a reason; appends history. |
| `GET` | `/commitments/{id}/history` | Paged history. |

## 8. What the repositioning removed

Endpoints for the old single-project system no longer exist:
`/dependencies`, `/commitments` (create/list/delete), `/arguments`,
`/projects/{id}/snapshots*`, `/projects/{id}/health`,
`/commitments/{id}/impact` and `/what-if`,
`/decisions/{id}/reversal` and `/decisions/{id}/dependencies`,
`/projects/{id}/stakeholder`, `/candidates/confirm-batch` (batch
confirmation) and `/candidates/{id}/challenges` (the pre-check gate).
The argument, snapshot and impact models were deleted with them — the
supervisor/chain/execution model replaced the deliberation layer.
