# AI Tools Reflection

Part II design document — DecisionTrace

**Status:** Draft for team review (2026-11-12) — team members fill in
their own usage notes where marked.

## 1. The Tool Chain

| Tool | What we used it for | Cost |
|---|---|---|
| Claude Code | Drafting all SRS sections; drafting and revising this design document; implementing features (graph analysis, candidates, snapshots, search, the deliberation layer, decision health); writing backend tests; driving Playwright verification | ChatGPT/Claude subscription, $20/mo (from SRS §11) |
| DeepSeek API (`deepseek-chat`) | Optional LLM path for candidate extraction; falls back to the rule engine on any failure or when no key is set | ≈ ¥30–45 for the ~12M tokens used so far (SRS §11 estimate) |
| Rule engine (own regex patterns, EN + ZH) | The default, offline extraction baseline — decisions, commitments, dependencies, arguments | Free, deterministic |
| Mermaid + python-docx | Diagrams and the Word conversion of the SRS | Free |
| Playwright (in the backend venv) | End-to-end verification against a temp database copy | Free |

## 2. How We Worked

The honest division of labor: **Claude drafted, we decided.** Every SRS
section and every design section here was written by the AI from our
requirements and feedback, then reviewed and corrected by the team; the
instructor's four written feedback points were incorporated by hand and
mapped to sections (§2.7 of the SRS). For code, the AI implemented
features and wrote the tests, and the team ran the builds, reviewed the
PRs, and fixed what the AI got wrong. The product mirrors this process,
which we only noticed halfway through: our own candidate gate (A2) — the
AI proposes, a human confirms or rejects — is the same loop we were
running as a team. That is either the design influencing us or us
designing what we were already doing; either way it made the trust
boundary in the product feel natural rather than invented.

## 3. What the AI Was Good At

- **Volume with consistency.** Drafting all 11 SRS sections, then keeping
  five design documents mutually consistent (ADR numbers, change-log
  entries, section references) after every revision — the kind of
  bookkeeping a four-person team would otherwise spend an evening on.
- **The mechanical half of implementation.** Graph algorithms, schema
  changes, i18n key pairs (EN/ZH), test cases: written fast and mostly
  right the first time.
- **Honest failure counting.** The AI wrote the evaluation protocol
  (§10) including the parts that might prove the LLM path unnecessary —
  we kept that framing because it is the right experiment, not because
  it flatters the tool.

## 4. Where It Failed, and What We Did About It

- **AI-flavored prose.** The instructor's written feedback on the idea
  submission said exactly this: the writing buried the team's real ideas
  under generic AI patterns. We rewrote in plain voice ("we", short
  sentences, concrete numbers) and kept that rule for every document
  since.
- **Plausible wrong code.** Regex patterns that passed the tests but
  matched lazily to a single character; a cascade rule forgotten when a
  new table was added; a search result routed to the wrong view. Every
  one was caught by the tests or the Playwright runs — which is why we
  now treat "the tests pass" as the *start* of verification, not the end.
- **Scope drift.** The AI produced five good ideas for one problem; the
  team had to say "no" to most of them. O3 in the open issues is about
  us, not the tools.

## 5. Verification We Actually Performed

54 backend tests (20 written for the deliberation layer alone); frontend
production builds; Playwright end-to-end runs against a temp backend
copy with a fresh database, including the empty-DB state; the curated
demo database restored after every verification session. For the AI
*inside* the product, the §10 protocol is the verification plan, and it
is deliberately fixed before Part III starts so the measurement cannot
be tuned to flatter the result.

## 6. What We Would Do Differently

Start the evaluation dataset on day one instead of after the features;
write the "the tool must beat hand-written minutes" baseline experiment
first, because it forced the design decisions (§5) that matter most; and
spend the AI budget on reviewing more, drafting less.

## 7. Artifacts Produced With AI Assistance

SRS (all sections, revised per feedback); this design document set
(architecture, data model, UI design, API spec, change log, summary,
models, issues, references — except team-written parts marked below);
most of the backend and frontend code; the test suites; the verification
scripts. **Team-written:** the instructor-feedback analyses and the
design decisions themselves; the contribution split below; the final
review pass of every document.

*[Team: add per-member usage notes here — what each of you used, and
whether you verified AI output yourself or relied on a teammate's
review.]*
