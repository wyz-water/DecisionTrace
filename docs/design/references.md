# Annotated References

Part II design document — DecisionTrace

**Status:** Draft for team review (2026-11-12)

Each reference is annotated with what it says, why we cite it, and how
it actually shaped DecisionTrace — including where we deliberately
departed from it.

---

## 1. Conklin, J. (2005). *Dialogue Mapping: Building Shared Understanding of Wicked Problems*. Wiley.

This book is the practical manual for IBIS (Issue-Based Information
System), the notation Rittel invented in the 1970s for design
rationale: issues (questions), positions (answers), and arguments (pros
and cons), drawn as a graph during a meeting instead of written as
minutes. Conklin's argument is that the notation only works if mapping
happens *in the meeting, in front of the participants*, because the
graph makes disagreements explicit instead of letting them hide in
prose. His account of why ordinary minutes fail — they record
conclusions and drop the reasoning, so later readers cannot tell which
objection was considered and why it lost — is, almost word for word,
the critique our instructor made of the first version of DecisionTrace.

The book shaped the deliberation layer directly. Our fifth concept,
`Argument` with `FOR`/`AGAINST` stances attached to a decision and
anchored to the source sentence, is IBIS reduced to what a meeting
transcript can support. We also took Conklin's caution seriously in one
respect he would recognize: he warns that structured capture fails when
it adds friction, because participants stop feeding the map. Our answer
is that the map is extracted from the discussion text and humans only
verify (§5, rules 1–3) — mapping without a mapper in the room. Where we
depart from the book: Conklin is skeptical that software can do the
mapping itself. Our claim is narrower and testable — the extractor does
not need to understand the debate, it needs to find who said what, and
§10's evaluation protocol measures exactly that.

---

## 2. Dung, P. M. (1995). On the acceptability of arguments and its fundamental role in nonmonotonic reasoning, logic programming and n-person games. *Artificial Intelligence*, 77(2), 321–357.

Dung's paper defines abstract argumentation frameworks: arguments as
opaque nodes, a single `attacks` relation between them, and
acceptability semantics computed from the attack graph — an argument is
acceptable if every attacker is itself attacked by an acceptable
argument, and so on. The paper's influence is its minimalism: it shows
that interesting reasoning about disagreement can be done with one
relation and a fixed-point computation, without modeling what the
arguments actually say.

We cite it for exactly that move. DecisionTrace's reasoning layer is
deliberately as thin as Dung's framework: arguments carry stance and
claim, and the only computed state is `contested` — a decision with at
least one open `AGAINST` argument (A13). We do not implement Dung's
acceptability semantics (that would require argument-to-argument attack
edges, which extraction from meeting text cannot supply reliably), and
we say so in the design rather than pretending otherwise. What we took
is the principle: disagreement is a graph property, computed on read
from the arguments, never a status a human marks by hand. The paper
also grounds our contested-state evaluation (§10, protocol 4): because
the state is derived, it can be measured precisely — the gold
annotation decides whether a decision "is" contested, and we count how
often the derivation agrees.

---

## 3. Nygard, M. (2011). Documenting Architecture Decisions. *Cognitect Blog*.

A short practitioner text that started the Architecture Decision Record
(ADR) practice: record a decision's context, the decision, and the
consequences, as a small file next to the code, so future maintainers
know why the system looks the way it does. Nygard's key observation is
that the *why* decays faster than the *what* — code survives, reasoning
does not — and that a one-page record with the context beats a wiki of
summaries.

DecisionTrace is, in one honest sentence, ADRs generalized from
architecture to every kind of team decision: the same
decision-plus-context-plus-consequence triangle, but extracted from
meeting text instead of hand-written by engineers, and connected into a
graph so consequences can be traced across decisions. Our ADR table in
the architecture document (A1–A13) is itself written in Nygard's format
— context, decision, consequences — which we treat as the system
documenting itself the way it asks its users to. The paper also reminds
us of the failure mode our design tries to avoid: ADRs work for a
two-person team that remembers to write them and fail exactly where
minutes do — nobody writes them. That is why DecisionTrace treats the
record as a by-product of the discussion (A10), not an extra writing
task.

---

## 4. Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2009). *Introduction to Algorithms* (3rd ed.). MIT Press. — Ch. 22 (elementary graph algorithms).

The standard textbook's graph chapters — adjacency representations,
depth-first search, and in particular topological sort (§22.4) — are
the theoretical basis of our execution layer. Topological order is
what makes the plan view honest: it is the order in which commitments
can be worked on without violating any dependency, computed by the
same algorithms the textbook describes (Kahn's algorithm in our case,
`services/graph.py`).

We cite the textbook rather than a research paper because the design
decision it grounds is deliberately classical: the execution layer uses
only well-understood, linear-time graph algorithms — topological sort,
cycle detection, transitive closure over `BLOCKS` edges. The instructor
feedback that steered the project ("graph-structured meeting summary
with a topological-sort flavor") is, in implementation terms, exactly
this chapter. The textbook also gives us the honest limits: topological
sort says nothing when the graph has a cycle (there is no valid order),
which is why the design refuses to store cycles and renders them as
errors instead of drawing a partial order. The planned critical-path
analysis (Part III, §5) is the same chapter one section further.

---

## 5. Wan, Z., Cheng, F., Mao, Z., Liu, Q., Song, H., Li, J., & Kurohashi, S. (2023). GPT-RE: In-context learning for relation extraction using large language models. *EMNLP 2023*.

GPT-RE frames relation extraction as in-context learning: rather than
fine-tuning, the authors embed the task (entity types, relations, a
few demonstrations) into the prompt of a general LLM and ask it to
extract triples from text, adding strategies to counteract the known
weaknesses — LLMs generating relations not in the schema, and bias
from demonstration order.

This is the closest published description of our optional DeepSeek
extraction path, and we cite it for two specific design consequences
that match our experience. First, hallucinated relations are the
central failure mode; our candidate gate (A2) is the structural answer
— the LLM can only propose, a human must confirm, and the §10 protocol
measures hallucination as one category of the error taxonomy. Second,
demonstration sensitivity means small prompt changes matter; that is
why the blind rules-vs-LLM comparison pins the prompt and model in
advance and why the rule engine remains the offline baseline (A3).
The honest difference between GPT-RE and our use: their benchmark is
scientific literature with fixed schemas; our input is messy team
meeting text in two languages, which is why field accuracy ≥ 80% is
our target, not the high nineties reported in the paper.
