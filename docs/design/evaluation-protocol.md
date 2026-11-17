# Evaluation Protocol: Summarisation, Extraction, Verification

> 执行细则 for architecture.md §10. This document turns the design
> promise into runnable steps for Part III: the annotation format, the
> scoring procedure, the experiments, and the report template. The
> scoring arithmetic already exists as pure functions in
> `backend/app/services/evaluation.py` (unit-tested); everything else
> in this document is procedure.

## 0. What is being evaluated, and by whom

Three capabilities, three protocols, one end-to-end experiment:

| # | Capability | Protocol | Owner |
|---|---|---|---|
| 1 | Meeting summarisation | §2 — coverage / faithfulness / snapshot agreement | 农国达 + 王耀增 |
| 2 | Key-information extraction | §3 — per-type P/R/F1 + error taxonomy | 陈昊宗 + 王耀增 |
| 3 | Human verification (the gate) | §4 — timed review vs hand-entry + gate rates | 李灏文 + 农国达 |
| 4 | Argument extraction & contested state | §5 — stance / linking / contested P/R | 王耀增 |
| E2E | The minutes baseline | §6 — timed head-to-head | whole team |

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

One JSON file per discussion per annotator:

```json
{
  "discussion_id": "D01",
  "annotator": "A",
  "annotated_at": "2026-11-20T10:00:00Z",
  "entities": [
    {
      "type": "DECISION",
      "fields": {
        "title": "Redis",
        "rationale": "it scales well",
        "status": "CONFIRMED"
      },
      "span": "We decided to use Redis because it scales well"
    },
    {
      "type": "COMMITMENT",
      "fields": {
        "owner": "Dora",
        "description": "set up the cache",
        "due_date": "2026-12-15",
        "decision_title": "Redis"
      },
      "span": "Dora will set up the cache by 2026-12-15"
    },
    {
      "type": "ARGUMENT",
      "fields": {
        "stance": "AGAINST",
        "claim": "the ops cost is too high",
        "author": "Bob",
        "target_title": "using Redis"
      },
      "span": "Bob disagrees with using Redis because the ops cost is too high"
    }
  ]
}
```

`span` is the exact sentence the entity comes from (extraction anchors
to it, so the gold set must too). Field sets per type follow
`ENTITY_FIELDS` in `evaluation.py`.

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
- `due_date` is the calendar date the sentence commits to, resolved
  the same way the extractor resolves it (`by Friday` → next Friday).
- `decision_title` links are by proximity: the nearest preceding
  decision sentence in the same discussion.
- Free-standing concerns are `ARGUMENT` with `target_title: null`.

## 2. Summarisation quality

### 2.1 Automated proxies (every iteration)

Against the gold set and the discussion text:

- `summary_coverage(gold_entities, summary_names)` — every gold entity
  appears in the summary. **Target: 100% of confirmed entities.**
- `summary_faithfulness(summary_names, discussion_text)` — nothing in
  the summary lacks support in the text. **Target: 100%.**
- `snapshot_agreement(gold_nodes, gold_edges, snapshot_nodes,
  snapshot_edges)` — saving the summary as a graph snapshot yields the
  same nodes/edges a human draws. **Target: agreement ≥ 80%.**

These proxies run in CI on every extraction change. They are cheap and
deterministic; the human check below is the authoritative one.

### 2.2 Human check (once per major iteration)

Two readers score 5 LLM summaries blind: per-sentence faithful /
partial / invented, and a completeness check against the gold set.
Report agreement between the readers, then the numbers. The adoption
rule from §6 applies to the LLM summary.

## 3. Extraction quality

### 3.1 Procedure

1. Run the pipeline (rules, or LLM) on each of the 20 discussions and
   dump candidates to `eval/runs/{pipeline}/{date}/D{id}.json`
   (same schema as the gold set, one `entities` list).
2. Score per discussion:
   `evaluation.score_all(gold, predicted, discussion_text)`.
3. Aggregate across the 20 discussions: sum TP/FP/FN per type, then
   precision/recall/F1 on the sums (micro-averaged — a missed decision
   in a short discussion counts as much as one in a long one).

### 3.2 Targets (SRS §7.6, split honestly)

| Entity type | Precision | Recall |
|---|---|---|
| DECISION | ≥ 0.80 | ≥ 0.80 |
| COMMITMENT | ≥ 0.80 | ≥ 0.80 |
| DEPENDENCY | ≥ 0.80 | ≥ 0.80 |
| ARGUMENT | ≥ 0.80 | ≥ 0.80 |

### 3.3 Error taxonomy (fixes target the dominant category)

| Category | Meaning | Typical fix |
|---|---|---|
| `missed_entity` | gold entity, no prediction — the worst failure (no human ever sees it) | new rule / prompt change / review prompt |
| `wrong_type` | span predicted under another type | pattern ordering |
| `wrong_field:<f>` | entity found, field wrong | field-specific rule |
| `false_positive` | predicted entity with no gold, span in text | tighten pattern / dedup |
| `hallucinated` | predicted entity whose span is not in the text | LLM prompt guardrail / drop rule |

Every fix PR names the category it targets and re-runs §3.1 — the loop
is the evaluation's main product.

## 4. Verification cost (the human gate)

### 4.1 Timed experiment

- Two tasks, same 10 candidates from the gold set, same participant
  (or counterbalanced): (a) review + confirm/edit/reject in
  DecisionTrace; (b) enter the same 10 records by hand (form or
  minutes-style notes).
- Measure total time per task, including error correction.
- **Target: ≥ 50% time saved (SRS usability goal U3).**

### 4.2 Gate rates

From the pilot's real review sessions (candidate table + the
confidence field):

- `verification_rates(candidates)` → confirmation rate, rejection rate.
- Edit rate is measured separately by diffing each confirmed
  candidate's payload against the created record (needs a small
  extraction log entry — Part III item).
- These three rates feed the **confidence-threshold batch confirm**
  (Part III item 2): the threshold is set so that candidates above it
  have an observed field-error rate ≈ 0 in the pilot.

## 5. Argument extraction and contested state

- Stance accuracy (`FOR` vs `AGAINST`): **≥ 80%**.
- Target-linking accuracy (argument attached to the right decision):
  **≥ 80%**.
- Contested-state P/R against the gold annotation (gold marks a
  decision contested iff it has an unresolved objection).
  **Contested precision is the priority** — a false contested badge
  erodes trust in the only state the system computes by itself.

## 6. Blind rules-vs-LLM comparison and the adoption rule

1. Both pipelines run on the frozen gold set (same §3.1 procedure).
2. Outputs are anonymised (`pipeline-X`) before scoring; the scorer
   does not know which is which until the report is drafted.
3. **Adoption rule (fixed in advance, A3):** the LLM path is kept only
   if it beats the rule engine on at least one metric, loses on none of
   the §3.2 targets, and stays inside a per-discussion cost cap
   (agreed before the run — e.g. ≤ 1 LLM call per discussion).
   Otherwise we stay on rules.

## 7. End-to-end experiment: the minutes baseline

- Input: one fresh 10-minute discussion (not in the gold set).
- Group A: writes minutes by hand, then builds the week's graph
  manually. Group B: uses DecisionTrace (paste → extract → review).
- Measured: total time, and graph completeness against a gold
  annotation of that discussion (nodes/edges, §2.1 arithmetic).
- **Pass condition for the product premise:** DecisionTrace is no
  slower than minutes-only while producing a full graph.

## 8. Report template (per iteration)

One table, one line per pipeline × iteration:

| Run | Pipeline | Type | P | R | F1 | TP | FP | FN | dominant taxonomy |
|---|---|---|---|---|---|---|---|---|---|

plus: summary coverage/faithfulness/snapshot agreement (§2), gate
rates and timed-review result (§4), contested P/R (§5), and the blind
comparison verdict (§6). The tables go into the Part III submission
and into the changelog next to the fix that produced them.

## 9. What exists today vs. what Part III builds

Already done: the scoring arithmetic (`evaluation.py`, 18 unit tests),
the rule pipeline, confidence scores, snapshots, audit trails.

Part III builds: the 20-discussion gold set (annotation sessions),
the run/score/report runner around `evaluation.py`, the blind-run
anonymisation, the timed experiments (§4, §7), and the iteration loop
(§3.3) — each fix measured by this protocol.
