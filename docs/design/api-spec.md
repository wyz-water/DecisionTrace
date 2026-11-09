# API Specification

Part II design document — DecisionTrace

**Status:** Draft for team review (2026-11-04)
**Base URL:** `http://127.0.0.1:8000` (development)
**Style:** JSON over REST; FastAPI generates OpenAPI docs at `/docs`.

## 1. Conventions

### Pagination envelope

Every list endpoint returns the same shape:

```json
{
  "items": [],
  "total": 0,
  "limit": 20,
  "offset": 0,
  "has_more": false
}
```

Query parameters: `limit` (1–100, default 20), `offset` (default 0).
The frontend consumes this through one hook (`usePagedList`), so a new
list endpoint is automatically UI-ready.

### Errors

- `404` — `{"detail": "<Entity> not found"}`
- `400` — validation (invalid status, missing field)
- `409` — consistency refusal with structured detail (cycle rejection
  carries `code`/`message`/`hops` so the UI can render the loop)
- `422` — request shape / empty search query

### Mutations

- `POST` creates, returns the created record.
- `PATCH` updates status/title/rationale and **appends a history row**
  with the old→new pair and the given reason.
- `DELETE` removes a record and everything that only makes sense with it
  (audit rows, edges, candidates); confirmed records referencing it keep
  existing with the pointer cleared (discussion deletion) or refuse to
  exist (dependency confirmation validates both ends first).

## 2. Endpoint Catalog

### Projects — `/projects`

| Method | Path | Purpose |
|---|---|---|
| POST | `/projects` | Create a project |
| GET | `/projects` | List projects |
| GET | `/projects/{id}` | One project |
| GET | `/projects/{id}/graph` | Nodes, edges, topological order, cycles, per-node analysis (blocked-by, depth) |
| GET | `/projects/{id}/conflicts` | Consistency conflicts (order violations, duplicates) |
| DELETE | `/projects/{id}` | Delete project and all its records |

### Discussions — `/discussions`

| Method | Path | Purpose |
|---|---|---|
| POST | `/discussions` | Record a discussion (title + content) — paste or file upload path (UC01). Responses carry a rule-based `summary` |
| GET | `/discussions?project_id=` | List, paginated; each row carries a computed `summary` (decisions / commitments / dependencies with names) |
| DELETE | `/discussions/{id}` | Delete; its candidates go with it, confirmed decisions keep their text but lose the pointer |

### Decisions — `/decisions`

| Method | Path | Purpose |
|---|---|---|
| POST | `/decisions` | Create a decision (UC04). **Rationale (the decision goal) is required** — `400` otherwise |
| GET | `/decisions?project_id=` | List, paginated |
| PATCH | `/decisions/{id}` | Revise title/rationale/status; appends `decision_history`. Rationale may change but **never be erased** (`400` on empty) |
| GET | `/decisions/{id}/history` | Change log, newest first |
| GET | `/decisions/{id}/impact` | Downstream commitments affected through `BLOCKS` closure |

### Commitments — `/commitments`

| Method | Path | Purpose |
|---|---|---|
| POST | `/commitments` | Create a commitment (UC05) |
| GET | `/commitments?project_id=` | List, paginated |
| PATCH | `/commitments/{id}/status` | Update status (validated set); appends `commitment_history` |
| GET | `/commitments/{id}/what-if` | Read-only preview: hypothetical DELAYED/BLOCKED downstream impact, split into newly vs already affected; never writes history |
| GET | `/commitments/{id}/impact` | Transitive downstream impact |
| GET | `/commitments/{id}/history` | Audit trail, newest first |
| DELETE | `/commitments/{id}` | Delete; audit rows and touching edges go with it |

### Dependencies — `/dependencies`

| Method | Path | Purpose |
|---|---|---|
| POST | `/dependencies` | Create an edge (UC06); rejects cycles with structured detail |
| GET | `/dependencies?project_id=` | List, paginated |
| DELETE | `/dependencies/{id}` | Remove an edge |

### Candidates — `/candidates`

| Method | Path | Purpose |
|---|---|---|
| POST | `/candidates/extract/{discussion_id}` | Run extraction (rules or DeepSeek); idempotent per discussion (UC02). Returns created candidates and a rule-based `summary` |
| GET | `/candidates?project_id=&status=` | List; `status` accepts a comma list (UC03). Pending rows carry `duplicate_of` against authoritative records |
| PATCH | `/candidates/{id}` | Edit the candidate payload before confirming |
| POST | `/candidates/{id}/confirm` | Promote to an authoritative record; cycle/duplicate checks apply here too. Single confirm is allowed even for duplicates |
| POST | `/candidates/confirm-batch` | Body `{candidate_ids}`. Confirms each; per-item failures reported; duplicates skipped by default |
| POST | `/candidates/{id}/reject` | Reject with an optional comment |

### Snapshots — `/projects/{id}/snapshots`

| Method | Path | Purpose |
|---|---|---|
| POST | `/projects/{id}/snapshots` | Capture the current graph under a title (a meeting summary as a graph) |
| GET | `/projects/{id}/snapshots?limit=` | List, newest first |
| GET | `/projects/{id}/snapshots/{sid}` | Full graph payload of one snapshot |
| GET | `/projects/{id}/snapshots/{a}/diff/{b}` | Structural diff between two snapshots (added/removed/changed nodes and edges) |
| DELETE | `/projects/{id}/snapshots/{sid}` | Delete one snapshot |

### Search — `/search`

| Method | Path | Purpose |
|---|---|---|
| GET | `/search?q=&project_id=` | UC08. AND-of-terms across discussions, decisions, commitments, both history tables. Ranked by matched-field count; snippet window with first-term highlight; paginated |

## 3. Status Vocabularies

| Entity | Values |
|---|---|
| Decision | `CONFIRMED` `SUPERSEDED` `REVOKED` |
| Commitment | `OPEN` `IN_PROGRESS` `COMPLETED` `DELAYED` `BLOCKED` |
| Candidate | `PENDING` `CONFIRMED` `REJECTED` |
| Dependency type | `BLOCKS` (default) |

## 4. AI Handoff Points

The AI participates in exactly two places, both behind the same review
gate (candidate → human → authoritative record):

1. **Extraction** — `POST /candidates/extract/{discussion_id}`.
   Rule-based regexes by default; when `DEEPSEEK_API_KEY` is set, the
   DeepSeek LLM parses instead, with automatic fallback to rules.
2. **Confirmation-time checks** — cycle and duplicate validation run
   when a dependency candidate is confirmed, so a bad AI suggestion can
   never corrupt the graph.

The AI never writes decisions, commitments, or dependencies directly.
