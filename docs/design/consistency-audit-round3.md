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

---

# Round 4 (2026-11-19 evening, second teammate audit)

The teammate re-audited the revised files (18 findings: 7 hard
contradictions + 4 semantic gaps + 4 formatting + 3 notes). All verified
against the repo and the code; fixes:

| # | Finding | Type | Fix |
|---|---|---|---|
| 1 | A17 claimed one chain can be "approved+executing with a revision awaiting choice" — impossible under the lock (A12 / POST nodes 400) | hard | A17 reworded: the seed spans the lifecycle states across chains (locked chain in execution, held chain, submitted chain awaiting choice, drafts) |
| 2 | Overrule scope had three variants (pending/held vs pending/held/approved vs "the others") | hard | Code is the tiebreaker and now says pending/held: added an API guard — a verdict on an approved chain is refused 400 ("approval is final", A12/R4); the overrule set is `[PENDING, HELD]`; A12, design-summary, §2.2, data-model invariant, api-spec §6, sequence diagram all aligned |
| 3 | Derived states listed as 4 in the sequence diagram, 5 in data-model/R2 | hard | Sequence diagram note now includes CYCLIC |
| 4 | A18 and C26 each claimed to be the complete deletion inventory but were mutually non-inclusive | hard | C26 now names the stakeholder view (C25) and the old Overview/plan page (C7), so C26 ⊇ A18's list |
| 5 | "plan view / plan list" still referenced after being declared deleted | stale | ui-design §2 → "execution-order board"; references §4 → "execution-order view" |
| 6 | "O3 in the open issues" dangling (only O1/O2 existed) | stale | O3 (scope drift) added to open-issues; architecture §11 → O1–O3 |
| 7 | PDF cover still said "an AI decision analyst over a dependency graph" (pre-repositioning) while the docx cover uses the repositioned positioning | hard | PDF cover subtitle rewritten to the 决策透明层 positioning; "第8组" added to the cover |
| 8 | State-mapping table: own DELAYED/BLOCKED fell through to READY; the precedence note ignored CYCLIC | gap | New table row + precedence note: CYCLIC wins over everything; DONE over BLOCKED; own BLOCKED blocks successors, not itself (stored status shown as-is next to the derived state) |
| 9 | R2 wording "the stored vocabulary is not the derived one" while BLOCKED is in both | hard | Reworded: "overlaps the derived one"; both are shown side by side in the UI |
| 10 | Re-verdicting an approved chain was undefined (code allowed it; docs said final) | gap | Code guard added + 2 new tests (verdict refused on approved chain; pure annotation still allowed); api-spec documents the 400 |
| 11 | Class diagram still missed created_at (ChainComment, ChainAnnotation), changed_at (CommitmentHistory), rationale/status/changed_at (DecisionHistory) | stale | All added to the class diagram per the models |
| 12 | C4's decision dedup had no API/UI counterpart | gap | api-spec §4 documents the computed `duplicate_of`; ui-design lists the duplicate badge |
| 13 | C26 row was one cell short (Reason held the evidence, Standing empty) | hard | C26 now has a Standing cell ("Current — this entry defines the repositioned system") |
| 14 | Dangling sentence fragment after reference 4 ("so 'which task may start next'…") | format | Merged into the Cormen annotation |
| 15 | §5.1 switcher claim vs A7 "every view is project-scoped" — how the supervisor's boards pick a project was unwritten | gap | ui-design §1: the supervisor's boards carry per-group selectors |
| 16 | "the chip is the only place verdicts are shown" vs the per-node action bar (A14) | hard | Reworded: the chip is the only place a verdict is *shown as a status*; the action bar is where it is set |
| 17 | Contributions §9.2 didn't attribute the repositioning; 陈昊宗's areas are all superseded | gap | 王耀增's areas now include the repositioning (PR #37); §2 notes the re-balance is the team's to confirm |
| 18 | PDF side: duplicated section titles; cover missing 第8组; TOC name mismatched the docx; page numbering differs | format | Duplicate doc-title removed from the template; cover fixed; TOC/docx chapter renamed "Updated Requirements (Change Log)"; zip README explains the per-section pagination |

Also: the teammate's note about 43 vs 37 backend tests — the deck was
already synced in round 3 (slide 15 says 37).

Rebuilt after round 4: PDF (34 pages, 0 blank/sparse pages, 0 mermaid
errors), docx, submission folder + zip.

---

# Round 5 (2026-11-19 night, third teammate audit of PDF+DOCX+PPTX)

Verdict from the audit: no structural "same fact, two opposite claims"
contradictions remain across the three files. The remaining items were
boundary wordings and PPT-doc alignment; all fixed:

| # | Finding | Fix |
|---|---|---|
| 1 | "the chain is never frozen" (api-spec submit, data-model PENDING) vs "an approved chain locks" | Qualified everywhere: "never frozen **before approval**" |
| 2 | A5 "the audit trail is never rewritten" vs DELETE /projects cascade-deletes history | A5: the only path that removes history is deleting the whole project (cascade — deliberate destruction, not a rewrite) |
| 3 | The submit fallback ("every node has a verdict") didn't exclude approved chains | New code guard: submit on an approved chain → 400 ("approved and locked: no re-submission"); api-spec documents it; 40 tests pass |
| 4 | PPT p8 implied all points become PENDING on submit / all others rejected | "最新未裁决点 → PENDING"; "其余待确认/待定点 → 已否决" |
| 5 | PPT p11 listed 待定 as a chain state (it's a node verdict) | "含待定点的链" |
| 6 | PPT p16's open-issue list missed R7 | R7 added to the slide title enumeration |
| 7 | Audit thought api-spec §6 lacked the 400 — it already had "Approval is final" (api-spec.md:120); no change |
| 8 | references §1 (Conklin) still present-tense about the deleted Argument concept | Past tense + "since replaced by the chain model" |
| 9 | Two different "nine documents" enumerations (§7.3 = 9 artifacts + 2 appendices; §7.7/§9.1 enumerated 9 items including appendices but missing the reflection/contributions) | Both now enumerate the full 11 (nine artifacts + two appendices) |
| 10 | contributions: "Percentages filled and sum to 100%" unchecked while the table still needs re-balancing | Checklist item reworded: "re-balanced around the repositioning and sum to 100%" |
| 11 | PPT p14 "证据 PR" — some entries cite documents/plan notes, not PR numbers | "证据:PR 或文档引用" |
| 12 | Six chips vs five teacher_status values, mapping unwritten | ui-design §2: explicit chip-to-value mapping (待确认=PENDING … 未建链=null) |
| 13 | own-BLOCKED task shows READY on the board | data-model note: the execution board renders both values side by side, so the owner's BLOCKED marking is never hidden |

Rebuilt after round 5: PDF (35 pp, 0 mermaid errors), docx, pptx (4
slides edited in place), submission folder + zip.
