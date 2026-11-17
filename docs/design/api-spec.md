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
| GET | `/projects/{id}/health` | Computed decision health: overturn rate, avg lifespan of overturned decisions, revision rate, contested rate, objection resolution rate (never stored) |
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
| PATCH | `/decisions/{id}` | Revise title/rationale/status/`decided_by`; appends `decision_history`. Rationale may change but **never be erased** (`400` on empty). `decided_by` is explicitly settable and clearable. `superseded_by_decision_id` names the successor — only when the resulting status is `SUPERSEDED` (validated: exists, same project, not self, `CONFIRMED`); any other status forces the link to `None` |
| GET | `/decisions/{id}/history` | Change log, newest first |
| GET | `/decisions/{id}/impact` | Downstream commitments affected through `BLOCKS` closure |
| GET | `/decisions/{id}/deliberation` | Arguments targeting the decision + `contested` (computed: ≥ 1 open AGAINST) |
| GET | `/decisions/{id}/reversal` | The reversal trace for `SUPERSEDED`/`REVOKED` decisions: `reversed`, `reversed_at`, `lifespan_days`, the successor, and a `signals` timeline (reversal / successor / objection / slip / decision_risk — decisions resting on this one), each citing the row it came from. Live decisions answer `reversed: false` with an empty list |
| GET | `/decisions/{id}/dependencies` | The decision graph around one decision: `upstream` (what it rests on) and `downstream` (what rests on it) |
| DELETE | `/decisions/dependencies/{id}` | Remove a decision-level edge (a correction path for the candidate gate) |
| GET | `/projects/{id}/stakeholder?name=` | The responsible person's view, computed on read: `decisions_made` (with status + contested), `decisions_affecting_me`, `commitments` (with state, blocked_by, waiting_on), `waiting_on_me`, `decisions_resting_on_mine` |

### Commitments — `/commitments`

| Method | Path | Purpose |
|---|---|---|
| POST | `/commitments` | Create a commitment (UC05) |
| GET | `/commitments?project_id=` | List, paginated |
| PATCH | `/commitments/{id}/status` | Update status (validated set); appends `commitment_history` |
| GET | `/commitments/{id}/what-if` | Read-only preview: hypothetical DELAYED/BLOCKED downstream impact, split into newly vs already affected; never writes history. Severity-weighted (A16): each affected item carries `baseline_severity`/`severity` (BLOCKED > DELAYED > none, propagated along `BLOCKS` edges; COMPLETED commitments isolate their downstream); the response adds `escalated` ids and blocked/delayed `severity_counts` + `baseline_severity_counts` over the affected set |
| GET | `/commitments/{id}/impact` | Transitive downstream impact |
| GET | `/commitments/{id}/history` | Audit trail, newest first |
| DELETE | `/commitments/{id}` | Delete; audit rows and touching edges go with it |

### Dependencies — `/dependencies`

| Method | Path | Purpose |
|---|---|---|
| POST | `/dependencies` | Create an edge (UC06); rejects cycles with structured detail |
| GET | `/dependencies?project_id=` | List, paginated |
| DELETE | `/dependencies/{id}` | Remove an edge |

### Arguments — `/arguments`

| Method | Path | Purpose |
|---|---|---|
| GET | `/arguments?project_id=&decision_id=` | List, paginated; filter by decision for its deliberation panel |
| PATCH | `/arguments/{id}` | Resolve an argument (status `RESOLVED`, reason required) |
| DELETE | `/arguments/{id}` | Delete one argument |

### Candidates — `/candidates`

| Method | Path | Purpose |
|---|---|---|
| POST | `/candidates/extract/{discussion_id}` | Run extraction (rules or DeepSeek); idempotent per discussion (UC02). Returns created candidates and a rule-based `summary` |
| GET | `/candidates?project_id=&status=` | List; `status` accepts a comma list (UC03). Pending rows carry `duplicate_of` against authoritative records |
| PATCH | `/candidates/{id}` | Edit the candidate payload before confirming |
| GET | `/candidates/{id}/challenges` | The decision pre-check gate (A14): drafted challenges for a pending decision candidate — pending objections targeting it, uncaptured concern sentences, overturned precedents, missing rationale. Computed on read, nothing stored |
| POST | `/candidates/{id}/confirm` | Promote to an authoritative record; cycle/duplicate checks apply here too. Single confirm is allowed even for duplicates. Optional body `{challenge_resolutions}`: every currently drafted challenge must be resolved with a reason (`400` with the missing ids otherwise); the resolutions are recorded as resolved `AGAINST` arguments on the new decision |
| POST | `/candidates/confirm-batch` | Body `{candidate_ids}`. Confirms each; per-item failures reported; duplicates skipped by default |
| — | candidate response | Every candidate carries `confidence` in [0,1], computed on read from its payload (evidence: rationale, dates, authors, targets — backend-independent, A17). Extraction sharpening: commitments following a decision sentence carry `decision_title` by proximity; commitment payloads keep `due_text` (the original due phrase) next to the resolved `due_date` |
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
| GET | `/search?q=&project_id=` | UC08. AND-of-terms across discussions, decisions, commitments, arguments (claim/author/stance/resolution reason), and both history tables. Ranked by matched-field count; snippet window with first-term highlight; paginated |

## 3. Status Vocabularies

| Entity | Values |
|---|---|
| Decision | `CONFIRMED` `SUPERSEDED` `REVOKED` |
| Commitment | `OPEN` `IN_PROGRESS` `COMPLETED` `DELAYED` `BLOCKED` |
| Candidate | `PENDING` `CONFIRMED` `REJECTED` |
| Argument | `OPEN` `RESOLVED` |
| Argument stance | `FOR` `AGAINST` |
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
