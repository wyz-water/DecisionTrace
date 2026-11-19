# Design Summary

Part II design document — DecisionTrace

**Status:** Current (2026-11-19)
**Word budget:** ~500 words (assignment requirement)

---

DecisionTrace is an AI decision analyst that sits between student
project teams and the supervisor who oversees them. The original idea
was to record decisions, commitments and dependencies as a graph. The
instructor review asked harder questions: who is this for, what
connects to what, and which decisions are even worth extracting? The
answers changed the product.

**Who it serves.** One supervisor, many student groups — a one-to-many
relationship. Each group pastes its meeting discussions; the system
extracts decision candidates with the exact source sentence; humans
verify at the single gate. The supervisor never transcribes anything:
they read submitted decision chains and decide.

**The decision chain.** A decision is no longer a lone form field
with a status. It is a decision point on a chain — one topic, one
line of discussion. A decision can start free-standing (a *free
decision*, the drafting state), but only points on a chain are
submitted, supervised and executed: starting a chain from a free
decision is the step that makes it count. Every point carries its own chat-style thread, so the
reasoning lives under the decision it reasons about. A revision is a
new point on the same chain; earlier points stay as history. Chain
points do not consume global numbering — display numbers are
project-scoped (`#1-2` = chain 1, its second point).

**The supervisor decides per point.** The supervisor sees submitted
chains inline — every point, its discussion, its annotations — and may
annotate any point, and approve, hold or reject any point. Approval is
a **selection**, not a rubber stamp: the supervisor may pick any point
as the best one, not necessarily the newest; choosing one overrules
the chain's other pending or held points, and the chain locks — a
decision in execution cannot keep changing.

**Execution follows approval, never precedes it.** Only an approved
point enters the execution phase: the group assigns tasks to it, the
system orders them topologically, and AI checks report what is
blocked, what is cyclic, and what started out of order. The supervisor
watches the same boards read-only, per group, per decision.

**The AI stays a candidate machine.** Extraction proposes, humans
confirm — for decisions, always. All insights (chain status, node
states, topological order, checks) are computed on read, never stored.

The system is implemented end to end: two groups' worth of realistic
demo data, bilingual UI, and Playwright-verified flows. The evaluation
protocol (Part III) measures the extraction pipeline — the only part
that still needs proving — before the LLM path is adopted.
