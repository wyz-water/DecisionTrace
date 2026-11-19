# Open Issues & Risks

Part II design document — DecisionTrace

**Status:** Current (2026-11-19) — updated after the repositioning.

## 1. Technical Risks

| # | Risk | Consequence if it materialises | Mitigation / plan |
|---|---|---|---|
| R1 | No authentication: the student/supervisor split is a UX split, not an authorization boundary | Anyone could act as the supervisor in a shared deployment | Course scope accepts it; the role split is enforced in the API's business rules (verdicts, approvals), and Part III can add a single login |
| R2 | Task-status vocabulary has no formal transition matrix | An odd jump (e.g. `COMPLETED → OPEN`) can confuse the computed states | Only the vocabulary is enforced today; the transition matrix is a Part III PoC item, same as before |
| R3 | Extraction quality of the LLM path is unmeasured | Blind adoption of a worse-or-equal extractor | The evaluation protocol (Part III) defines precision/recall, an error taxonomy, and a pre-fixed adoption rule; rules remain the default until then |
| R4 | The chain lock is one-way | An approved chain can never be revised, even if the execution turns out misdirected | Deliberate: approval = selection, and a decision in execution must be stable. Reopening (with a recorded reason) is a candidate Part III feature |
| R5 | The supervisor reads everything inline — long chains become long pages | Review fatigue for very active groups | Fine at course scale; collapsing of closed points is a cheap later improvement |
| R5.5 | Task dependencies cannot be created or removed from the UI anymore (the endpoints were dropped in the cleanup; edges ship with the demo data) | Execution ordering is frozen after seeding — new chains' tasks form no edges | Part III item: restore edge creation on the execution board, with cycle refusal before storage |
| R6 | Per-node verdicts have no verdict timestamp | The "when did the supervisor choose X" question is answered by annotations only | Annotations carry timestamps; a verdict timestamp column is trivial if needed |

## 2. Organizational Risks

| # | Risk | Mitigation |
|---|---|---|
| O1 | The repositioning replaced a large, working feature set (deliberation layer, snapshots, impact analysis) | The pre-repositioning tag on `main` preserves it; the replacement was reviewed view-by-view with the user before the sweep |
| O2 | Docs drift from code | This pass: docs rewritten to match the implementation; the API spec documents removed endpoints explicitly |

## 3. Issue Log

| # | Issue | Status |
|---|---|---|
| I1 | Deliberation layer (arguments, contested) vs the repositioned chain model | Resolved — replaced by per-node chain discussion and supervisor verdicts |
| I2 | Snapshots / graph comparison | Removed with the repositioning |
| I3 | Impact / what-if previews | Removed — the execution phase's checks (blocked/out-of-order) carry the insight |
| I4 | Decision health metrics | Removed; per-group dashboards carry the supervision insight |
| I5 | Global numbering leaked database ids | Resolved — project-scoped display numbering |
| I6 | Approved chains could keep appending revisions | Resolved — approved chains lock |
| I7 | Approving one point left the chain's other points silently pending | Resolved — approval overrules them (REJECTED) and they leave the decisions table |
