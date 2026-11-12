# Open Issues & Risks

Part II design document — DecisionTrace

**Status:** Draft for team review (2026-11-12)

What we know we do not know yet. The technical risks are the ones from
the architecture document (§11, R1–R8), restated here so this artifact
stands alone; the organizational risks are the ones that will decide
whether Part III can actually run. Every technical risk has a Part III
validation attached — that is the point of the next assignment, and of
this table.

## 1. Technical Risks

| # | Risk | Why it matters | Part III validation |
|---|---|---|---|
| R1 | Status-transition matrix: only the vocabulary is enforced; which jumps are legal (e.g. `DELAYED → COMPLETED`) has no formal rule | Illegal transitions can silently corrupt the trace's meaning | PoC an explicit rule set and measure how many real updates it blocks vs saves |
| R2 | Scale ceiling: SQLite single-machine + no authentication | Fits a team MVP only; multi-tenant hosting needs auth, roles, a server database | A1 documents the migration path; not planned for Part III |
| R3 | AI trust: field accuracy ≥ 80% is a target, not a measurement; whether review really saves time is unmeasured | The whole automation-first premise stands or falls on this | The §10 evaluation protocol (gold set, precision/recall, timed review, minutes baseline); results reported in Part III |
| R4 | Concurrent updates: append-only history prevents overwriting the trace, but two members updating the same commitment still race (last write wins) | A lost status update can leave the plan wrong without anyone noticing | Confirm mechanism or a version check on update |
| R5 | Dependency editing: edges can be created and removed but not edited | Changing an edge means delete + recreate, which loses the audit trail of the change | Add PATCH for edges with the same cycle/duplicate checks |
| R6 | Argument history: resolving an argument updates the row in place; no append-only `argument_history` yet | A5's append-only principle does not cover the deliberation layer | History table + resolution semantics; then resolutions join the audit trail |
| R7 | Deliberation state in snapshots: a graph snapshot captures commitments and dependencies, not the arguments of that meeting | A "meeting summary as a graph" that drops the meeting's debate is incomplete | Include argument state in snapshots, or document explicitly why the execution layer alone is the snapshot unit |
| R8 | Extraction quality of the *argument* layer: stance and target linking are rule-heuristic today and unmeasured | A false contested badge erodes trust in the only state the system computes by itself | Stance accuracy ≥ 80%, target-linking accuracy ≥ 80%, contested precision/recall against the gold annotation (§10, protocol 4) |

## 2. Organizational Risks

| # | Risk | Why it matters | Mitigation |
|---|---|---|---|
| O1 | The evaluation workload (20 discussions, double annotation) lands on the same people who are also building the PoCs | Part III's schedule could starve the measurement it depends on | Fix the dataset first (one afternoon together), then build; reuse the team's own meeting records so annotation doubles as real trace upkeep |
| O2 | LLM dependency drift: the DeepSeek prompt/API behavior can change between Part II and Part III | Blind comparison results would not be reproducible | Pin the prompt and model name in the protocol; keep the rule engine as the offline baseline (A3) so the demo never depends on the network |
| O3 | Scope growth from the design discussions (ask view, proactive alerts, critical path, argument map, decision health…) | More ideas than one assignment can hold | The Part III items are priority-ordered in §5; everything beyond the top three is explicitly a stretch goal, not a promise |
| O4 | The demo database must stay clean for grading demos | Test rows leaking into the demo scenario would make the live demo incoherent | Workflow rule already in place: verify against a temp copy, restore the curated DB after; documented in the contributor guide |

## 3. Issue Log

| # | Issue | State |
|---|---|---|
| I1 | Decisions created before 2026-11-12 had no `created_at`; demo DB backfilled at migration time | Closed (schema + backfill done; new decisions always carry the timestamp) |
| I2 | Free-standing arguments (no target decision) were invisible after confirmation | Closed (deliberation view, C18) |
| I3 | Search did not cover arguments; argument hits landed in the wrong view | Closed (search coverage + navigation, C18) |
