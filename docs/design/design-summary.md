# Design Summary

Part II design document — DecisionTrace

**Status:** Draft for team review (2026-11-12)
**Word budget:** ~500 words (assignment requirement)

---

DecisionTrace started from a simple observation: teams spend a lot of
meetings making decisions, and then lose them. The idea submission
proposed four concepts — Decision, Commitment, Dependency, Change — as a
graph, where a meeting summary is a snapshot of that graph and a
topological order shows what is blocked. The SRS (Part I) specified eight
use cases around that idea.

The design presented here changes one thing, and it changes everything
else: **we stopped recording decisions as conclusions.** The instructor
review made the point plainly — decision-making is a high-level activity,
and a form that stores "title, owner, status" records only the cheapest
part of it, making the tool worse than the meeting minutes it replaces.
So this revision adds a fifth concept, **Argument** (`FOR`/`AGAINST`,
claim, author, source sentence), and the product becomes two graph
layers: the *execution layer* (commitments and dependencies — what is
blocked, what would be impacted) and the *deliberation layer* (arguments
on decisions — what is supported, what is contested, and why).

The second principle follows from the same critique: **the human only
verifies.** Discussions are pasted or uploaded as-is; extraction
proposes candidates with the exact source sentence highlighted; a human
confirms, edits or rejects, in batches. Manual forms are the fallback,
not the path. Derived views — topological order, impact, overdue,
what-if, contested state, decision health — are computed on read, never
stored and never hand-maintained.

Key architectural decisions: SQLite for zero setup (A1); AI output is
always a *candidate* behind a human gate (A2); rule-based extraction by
default with an optional DeepSeek path and automatic fallback (A3);
append-only history so change is first-class (A5); computed-on-read
consistency (A8); automation-first intake (A9); the discussion text is
the system of record and the trace is derived from it (A10); "contested"
is a computed state, never a manual status (A13).

What is already working, beyond the design on paper: all eight use cases
are implemented, the deliberation layer ships with English and Chinese
rule extraction, a project-wide deliberation view, contested attention
entries, search coverage, and a retrospective card with computed
decision-health metrics (overturn rate, lifespan, revision rate,
objection resolution rate). Fifty-four backend tests pass and the flows
were verified end-to-end with Playwright.

Part III will test the risky parts, with protocols fixed in advance: a
20-discussion double-annotated gold set, per-field precision and recall
for extraction, blind rules-vs-LLM comparison with a pre-fixed adoption
rule, a timed end-to-end experiment against a hand-written-minutes
baseline, and PoCs for the natural-language ask view, proactive alerts,
critical-path analysis and the argument-map view. The evaluation plan
(§10) turns the instructor's critique into a pass condition: the tool
must be no slower than minutes, while producing the graph minutes
cannot.

The design document consists of the architecture (§1–§11), the data
model, the UI design, the API specification, the requirements change log
(C1–C20), this summary, the design models, the open issues, and this
document's companions: the AI tools reflection, the annotated
references, and the team contributions.
