# Evaluation Protocol: Extraction and the Human Gate

> 执行细则 for architecture.md §10. This document turns the design
> promise into runnable steps for Part III: the annotation format, the
> scoring procedure, the experiments, and the report template. The
> scoring arithmetic already exists as pure functions in
> `backend/app/services/evaluation.py` (18 unit tests); everything else
> in this document is procedure.

## 0. What is being evaluated, and by whom

The repositioned system is deterministic everywhere except one place:
the extraction pipeline (rules now, optional LLM path). Part III
measures that pipeline and the human gate in front of it.

| # | Capability | Protocol | Owner |
|---|---|---|---|
| 1 | Decision extraction | §2 — precision/recall per field + error taxonomy | 陈昊宗 + 王耀增 |
| 2 | Human verification (the gate) | §3 — timed review vs hand-entry + gate rates | 李灏文 + 农国达 |
| 3 | Blind rules-vs-LLM comparison | §4 — same gold set, anonymised scoring, pre-fixed adoption rule | 王耀增 |
| E2E | The minutes baseline | §5 — timed head-to-head | whole team |

**Golden rule:** the gold set is frozen before any scoring starts, and
every pipeline (rules, LLM) is scored against the same set by the same
arithmetic. Results are comparable across iterations only under this
rule.

## 1. The gold set

### 1.1 Corpus

20 discussions from the team's own meetings (or the recorded pilot
discussions), 5–15 sentences each, mixed EN/ZH. The 20 are chosen once
and frozen. Store them under `eval/gold/discussions/` as
`D{id}.txt` (id zero-padded).

### 1.2 Annotation format

One JSON file per discussion per annotator. The current extractor
produces DECISION candidates only, so the gold set annotates decisions
only:

```json
{
  "discussion_id": "D01",
  "annotator": "A",
  "annotated_at": "2026-11-20T10:00:00Z",
  "entities": [
    {
      "type": "DECISION",
      "fields": {
        "title": "Use Redis for caching",
        "rationale": "it scales well",
        "decided_by": null
      },
      "span": "We decided to use Redis for caching because it scales well"
    },
    {
      "type": "DECISION",
      "fields": {
        "title": "Use Redis for caching",
        "rationale": "it scales well",
        "decided_by": "Alice"
      },
      "span": "Alice decided to use Redis for caching because it scales well"
    }
  ]
}
```

`span` is the exact sentence the entity comes from (extraction anchors
to it, so the gold set must too). `decided_by` is null for collective
decisions ("we decided…") — the extractor never invents a maker.

### 1.3 Double annotation and adjudication

1. Two team members annotate independently (no peeking, no discussion
   during annotation).
2. Compute inter-annotator agreement:
   `evaluation.inter_annotator_agreement(entities_a, entities_b)`
   (tag each entity with `_annotator`). Report Cohen's kappa and
   per-field simple agreement.
3. **Acceptance threshold: kappa ≥ 0.6 and per-field agreement ≥ 0.9.**
   Below threshold, the pair discusses the disagreements, fixes the
   annotation guide (not the data), and re-annotates the disagreements.
4. Adjudicated gold = one JSON per discussion, `annotator: "GOLD"`.
   This is the frozen set.

Known limitation, stated honestly: the kappa in `evaluation.py` is
computed over the union of *detected* entities — it cannot see spans
both annotators agree are empty. The per-field agreement and the
adjudication step compensate.

### 1.4 The annotation guide (one page, written once)

- A span is an entity only if a human reading the sentence alone would
  record it. No inference from context.
- `decided_by` is set only when the sentence names the person;
  "we decided / 我们决定" stays null.

## 2. Extraction quality

### 2.1 Procedure

1. Run the pipeline (rules, or LLM) on each of the 20 discussions and
   dump candidates to `eval/runs/{pipeline}/{date}/D{id}.json`
   (same schema as the gold set, one `entities` list).
2. Score per discussion:
   `evaluation.score_all(gold, predicted, discussion_text)`.
3. Aggregate across the 20 discussions: sum TP/FP/FN, then
   precision/recall/F1 on the sums (micro-averaged — a missed decision
   in a short discussion counts as much as one in a long one).

### 2.2 Targets (SRS §7.6)

| Entity type | Precision | Recall |
|---|---|---|
| DECISION (title) | ≥ 0.80 | ≥ 0.80 |
| decided_by (on decisions a human would name) | ≥ 0.80 | ≥ 0.80 |

### 2.3 Error taxonomy (fixes target the dominant category)

| Category | Meaning | Typical fix |
|---|---|---|
| `missed_entity` | gold entity, no prediction — the worst failure (no human ever sees it) | new rule / prompt change / review prompt |
| `wrong_type` | span predicted under another type | pattern ordering |
| `wrong_field:<f>` | entity found, field wrong | field-specific rule |
| `false_positive` | predicted entity with no gold, span in text | tighten pattern / dedup |
| `hallucinated` | predicted entity whose span is not in the text | LLM prompt guardrail / drop rule |

Every fix PR names the category it targets and re-runs §2.1 — the loop
is the evaluation's main product.

## 3. Verification cost (the human gate)

### 3.1 Timed experiment

- Two tasks, same 10 candidates from the gold set, same participant
  (or counterbalanced): (a) review + confirm/edit/reject in
  DecisionTrace; (b) enter the same 10 records by hand (form or
  minutes-style notes).
- Measure total time per task, including error correction.
- **Target: ≥ 50% time saved (SRS usability goal U3).**

### 3.2 Gate rates

From the pilot's real review sessions (the candidate queue with the
per-maker filter):

- `verification_rates(candidates)` → confirmation rate, rejection rate.
- Edit rate is measured separately by diffing each confirmed
  candidate's payload against the created record (needs a small
  extraction log entry — Part III item).
- These rates calibrate future review-UI work (e.g. re-introducing a
  confidence-based batch review, dropped in the repositioning — the
  numbers, not a guess, should decide whether it earns its way back).

## 4. Blind rules-vs-LLM comparison and the adoption rule

1. Both pipelines run on the frozen gold set (same §2.1 procedure).
2. Outputs are anonymised (`pipeline-X`) before scoring; the scorer
   does not know which is which until the report is drafted.
3. **Adoption rule (fixed in advance, A3):** the LLM path is kept only
   if it beats the rule engine on at least one metric, loses on none of
   the §2.2 targets, and stays inside a per-discussion cost cap
   (agreed before the run — e.g. ≤ 1 LLM call per discussion).
   Otherwise we stay on rules.

## 5. End-to-end experiment: the minutes baseline

- Input: one fresh 10-minute discussion (not in the gold set).
- Group A: writes minutes by hand, then enters the decisions by hand.
- Group B: uses DecisionTrace (paste → extract → review → the decisions
  are in the records; optionally start a chain).
- Measured: total time, and decision-record completeness against a gold
  annotation of that discussion (same arithmetic as §2.1).
- **Pass condition for the product premise:** DecisionTrace is no
  slower than minutes-only while capturing the decisions completely.

## 6. Report template (per iteration)

One table, one line per pipeline × iteration:

| Run | Pipeline | Type | P | R | F1 | TP | FP | FN | dominant taxonomy |
|---|---|---|---|---|---|---|---|---|---|

plus: gate rates and the timed-review result (§3), and the blind
comparison verdict (§4). The tables go into the Part III submission
and into the changelog next to the fix that produced them.

## 7. What exists today vs. what Part III builds

Already done: the scoring arithmetic (`evaluation.py`, 18 unit tests),
the rule pipeline (EN + ZH, DECISION-only), the candidate review queue
with the per-maker filter, and the two-group demo dataset.

Part III builds: the 20-discussion gold set (annotation sessions), the
run/score/report runner around `evaluation.py`, the blind-run
anonymisation, the timed experiments (§3, §5), the extraction log for
edit-rate measurement (§3.2), and the iteration loop (§2.3) — each fix
measured by this protocol.
