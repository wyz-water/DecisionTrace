# Consistency Audit Round 3 — Checklist

Part II design documents · internal working record (not a submission artifact)

A teammate ran an AI audit over the combined design document and the
presentation deck ("only check the internal contradictions of these two
documents"). Every claim was verified against the repository source
files and the code; each fix below is what the round-3 commit actually
changed. Types: **hard** = two places state opposite things; **gap** =
a branch/state is undefined; **stale** = describes a removed feature or
an outdated reference; **count** = wrong number/citation.

## 1. The five definitional forks (resolved against the code)

| Position | A said | B said | Type | Fix |
|---|---|---|---|---|
| decision-summary vs data-model | "A decision is no longer a form field… it is a decision point on a chain" | "a decision either stands alone or is a node of one chain"; A15/§5.1/PPT p11: free decisions #1..#M | hard | Free decisions exist as the pre-chain drafting state; only chain points are supervised/executable (`POST /chains` starts a chain from a free decision). design-summary, architecture A11/§2, data-model, api-spec §5 now say so |
| architecture A5 vs api-spec §5 | "Records are immutable" | `PATCH /decisions/{id}` edits title/rationale/status/decided_by in place | hard | A5 reworded: every edit appends an old→new history row; the audit trail is immutable, the current row is editable |
| data-model §2 vs §3 | Commitment stored statuses include BLOCKED/DELAYED | node states WAITING/READY/BLOCKED/DONE are "never stored" | hard | Mapping table added (data-model §3): COMPLETED→DONE, pred DELAYED/BLOCKED→BLOCKED, cycle→CYCLIC, else WAITING/READY; CYCLIC added to the derived list (the code emits it); R2 updated to reference the mapping |
| references §4 / changelog end / R5.5 | "refuses to store cycles" (present tense) | edges only come from seed data; no edge-creation endpoint exists | hard | Reworded everywhere: cycle refusal applies when edge creation returns in Part III (R5.5); today the read-time cycle check is defensive (seed data is acyclic) |
| A15 / decisionNumbers.js | chains #1..#N and free decisions #1..#M share one numbering space | no distinguishing prefix documented | gap | A15 documents the actual rule: chains and free decisions share per-project numbering but live in different lists, so a bare #N is unambiguous in its view |

## 2. State machine closure

| Position | Problem | Type | Fix |
|---|---|---|---|
| chain derived status vs verdict chips | HELD exists only as a node verdict; a held chain derives PENDING and stays in the awaiting queue — never documented | gap | data-model, api-spec §6 and ui-design §4 now state it: held/rejected chains stay in the queue until the group appends a revision and re-submits; re-submission is allowed and updates the timestamp. New R7 flags an explicit "return to group" transition as a Part III candidate |
| submit with all-verdict nodes | "the latest verdict-less node becomes PENDING" — undefined when every node has a verdict | gap | api-spec §6: when every node already carries a verdict, nothing becomes PENDING and the chain stays PENDING until a revision is submitted |
| "other points" scope | A12/design-summary: "other points" (unqualified) vs api-spec/data-model/sequence: "pending/held/approved" | hard | Unified to pending/held/approved; never-submitted points stay untouched drafts (A12, design-summary, api-spec). Code already matches. I7's "Resolved" claim corrected accordingly |

## 3. Change log §4 vs the body

| Entry | Problem | Type | Fix |
|---|---|---|---|
| C1 | Auto-extract on import is true in the code — but the sequence diagram shows only a manual run-extraction step | stale | Sequence diagram notes the import triggers extraction automatically; api-spec §3/§4 documents both triggers |
| C3 | Batch confirmation — no endpoint, no UI remains | stale | Marked "Superseded by C26" |
| C4 | Dedup against decision/commitment/dependency — code dedups against decisions only | stale | Marked "Partly kept" (decision dedup remains) |
| C5/C7 | Meeting summaries + snapshot save; overdue highlighting on the removed Overview/plan views | stale | Marked "Superseded by C26" |
| C6 | `what-if?status=DELAYED\|BLOCKED` — the pipe splits the Markdown table cell | hard | Rewritten with a slash; row marked superseded |
| C10/C14/C15/C17–C19/C21–C24 | Describe removed features in present tense; stale ADR citations (A11–A18 old numbering) | stale | Each marked "Superseded by C26" with the reason; stale ADR refs removed |
| C11/C12 | Cite "§11 R1" (actually R2) and "§11 R5" (actually R5.5); C12 claims create/remove implemented while R5.5 says dropped | count + hard | Citations fixed to R2/R5.5; C12 rewritten to "edges ship with the seed data; restoration is the Part III item" |
| C16 | "summarisation coverage/faithfulness/snapshot metrics" — the protocol no longer has these | stale | Cell rewritten to the protocol's actual content |
| C20 | Critical path: fate unstated in C26 | gap | Marked "Part III plan — unaffected by the repositioning" |
| C25 | Stakeholder view/decision-dependency candidates removed, but `decided_by` remains | stale | Marked "Partly kept" (`decided_by` only) |
| C26 | Deletion list missed C3/C5/C7/C14/C15/C24 and the C4/C12/C25 narrowing | gap | C26 now carries the complete inventory and the narrowing notes |
| §4 ending | "Unchanged from SRS: … cycle refusal before storage" contradicts R5.5 | hard | Cycle refusal moved to its Part III context (R5.5) |
| §4 status | "Draft for team review (updated 2026-11-12)" while C26 sits in the same table | stale | Status now "Current (2026-11-19)" with a "Standing" column per entry |

The table gained a **Standing** column (Current / Superseded by C26 / Partly kept / Part III plan) so the log reads as design history, not as a description of the current system.

## 4. "What was deleted" — five versions unified

§2.4 A18 (5 items), C26 (6 groups), ai-reflection §8 (3), data-model §4 (3), PPT p13 (3), PPT p14 (4) all disagreed. Now:

- **C26 is the canonical inventory**: C3, C5, C6, C7, C10, C14, C15, C17–C19, C21–C24 removed; C4/C12/C25 narrowed; C20 untouched.
- A18, data-model §4, ai-reflection §8, PPT p13/p14 all cite the same feature set and point to C26 for the complete list.

## 5. Counts and cross-references

| Position | Problem | Type | Fix |
|---|---|---|---|
| references §3 (Nygard) | "ADR table (A1–A13)" | count | A1–A18 |
| references §2 (Dung) | cites A13 for the contested state | stale | Rewritten to pre-repositioning framing + A12 |
| references §4 (Cormen) | "critical-path analysis (Part III, §5)" — §5 is no longer that section | stale | "(Part III)" |
| references §1 (Conklin) | "(§5, rules 1–3)" | stale | "(architecture §5, A9)" |
| ai-reflection §3 | "keeping five design documents mutually consistent" | count | "this document set (nine artifacts plus appendices)" |
| open issues | three counts: architecture §11 headlines (3), open-issues table (7), PPT p16 (4) | count | architecture §11 headlines now list the Part III set (R1/R2/R3/R4/R5.5/R7) and point to the full table; PPT p16 lists risks and the evaluation protocol separately (protocol = verification plan, not a risk) |
| architecture §5 | "one role only" then "a separate checker role" | hard | "two roles: candidate proposer + checker" |
| maturity labels | §4/§7 "Draft for team review (11-12)" vs everything else "Current (2026-11-19)" | stale | ai-reflection and the change log now "Current (2026-11-19)"; per-member usage notes remain pending; contributions.md stays "PROPOSED ALLOCATION" (the team must still confirm percentages — intentional) |
| ai-reflection §5 | "43 backend tests" | count | 37 (six tests removed with the dead snapshot/summary scoring — see below) |

## 6. Diagrams vs the data model

| Position | Problem | Type | Fix |
|---|---|---|---|
| ERD | `CANDIDATE \|\|--o\| DECISION` (every candidate must be confirmed), `DECISION }o--\|\| CHAIN` (every decision chained), `DECISION \|\|--o{` comments/annotations (decision_id mandatory) | hard | Cardinalities fixed to `}o--o\|` and `\|o--o{` (free decisions, pending/rejected candidates, chain-level comments and nullable annotations are all legal) |
| class diagram | missing `due_date` (Commitment), `project_id` (Dependency), `created_at` (Chain, Candidate), `superseded_by_decision_id` (Decision); `Chain "1" --> "*" Decision` and `Decision "1" --> "*" ChainComment/Annotation` too strict | hard | Fields added (superseded_by marked legacy in a note); multiplicities fixed to 0..1 |

## 7. PPT internal

| Slide | Problem | Type | Fix |
|---|---|---|---|
| 2 | "由此回答三个问题" but the three pain points above are a different triad | hard | "三个痛点引向三个根本问题:…" |
| 9 & 10 | both titled 执行阶段 | count | Slide 10 → 执行顺序与检查 |
| 11 | "覆盖全部状态" — the seed has no REJECTED node; and "独立决策 #1..#M" unqualified | count | Now "覆盖链生命周期状态(讨论中/待确认/待定/已认可)"; "独立决策(未成链草稿)" |
| 13 vs 14 | deletion lists differ (3 vs 4 items) | count | Both now list 论点层/快照/impact/what-if/决策健康/预检/逆转追踪 and point to C26 |
| 15 | "三层验证" lists four bullets; "43 tests" | count | "四层验证"; 37 tests |
| 16 | mixes risks with the evaluation protocol | hard | Subtitle separates them: risks R1/R2/R3/R4/R5.5 vs 验证计划(评估协议); R2/R3 added |

## 8. Between the deck and the document

| Position | Problem | Type | Fix |
|---|---|---|---|
| PPT p5 vs ui-design §1 | "顶部切换项目" vs "supervisor side: the switcher is not needed" | hard | PPT: "学员侧顶部切换项目,导师侧按组分栏" |
| PPT p6 vs data-model | "抽取候选带…决策人" vs "team decisions stay null" | gap | PPT adds "(集体决策除外)" |
| PPT p8 | state machine has no HELD/rejected branch; "离开决策表" claim | gap | Loop-back added: "导师待定/否定 → 组内修订,重新提交"; "链内历史保留,逐点标记已否决" |
| PPT p10 vs references | "环…每次读取时重新检查" vs "refuses to store cycles" | hard | PPT: cycle check is defensive; refusal returns with edge creation in Part III |

## 9. Bonus findings (outside the audit's two-document scope)

These are code-vs-docs contradictions the audit could not see; the round-3
commit fixes the code so A18's "dead features are deleted" claim is true:

| Finding | Fix |
|---|---|
| `GET /commitments` and `DELETE /commitments/{id}` still existed while api-spec §8 claimed "/commitments (create/list/delete)" removed | Endpoints removed (no frontend or test usage) |
| `DecisionUpdate.superseded_by_decision_id` still writable via PATCH | Field removed from the update schema; the column stays in stored rows for pre-repositioning history |
| `evaluation.py` still scored snapshots and meeting summaries (11 snapshot references) | `summary_coverage`, `summary_faithfulness`, `snapshot_agreement` (+ `_display_name`, `DISPLAY_NAME_FIELD`) and their six tests removed; 43 → 37 tests |

## 10. What was deliberately NOT changed

- **Code behaviour** — no product semantics changed; every code edit removes dead surface only (37 backend tests pass, frontend untouched).
- **contributions.md** — the "PROPOSED ALLOCATION" label and the checklist stay: the team must confirm percentages before submission.
- **The demo video** — the live system's UI is unchanged, so the recording still matches the product.
- **`docs/demo-script.md`** — checked for stale feature references; none found.

Rebuilt after the fixes: `Desktop/DecisionTrace_PartII_Design.pdf` (41 pages),
`Desktop/DecisionTrace_PartII_Design.docx`, `Desktop/DecisionTrace_设计展示.pptx`
(16 slides edited in place), and the submission folder/zip
`Desktop/Project8-DecisionTrace-PartII(.zip)`.
