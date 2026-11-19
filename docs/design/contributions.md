# Team Member Contributions

Part II design document — DecisionTrace

**Status:** PROPOSED ALLOCATION — updated 2026-11-19 with the
repositioning work; the team must still confirm the percentages. Work areas and
percentages below come from the git history and the PR record; the
mapping of GitHub handles to student names follows the role table in
the SRS. Adjust the mapping and percentages to match what each member
actually did before submission.

Team (from the SRS): 王耀增 2451393, 农国达 2453193, 李灏文 2453192,
陈昊宗 2453197.

## 1. Work Areas (as the repository records them)

| Area | What happened | Evidence |
|---|---|---|
| Idea submission & SRS (Part I) | All 11 SRS sections drafted with AI assistance, revised per instructor feedback; submission zip built | SRS, `docs/SRS/` |
| Graph core | Graph payload, topological order, cycle detection, impact closure; cycle rejection on edge creation | PRs #6, #8 |
| AI candidate pipeline | Extraction (rules + DeepSeek), candidate review UI, confirm/edit/reject, dedup, prerequisite panel | PRs #7, #9, #16 |
| Intake & file handling | Discussion upload (.txt/.md/.docx/.pdf, GBK fallback), drag & drop, project switcher, deletions | PRs #16, #20 |
| Manual creation forms | Manual decision and commitment creation with rationale-required validation | PR #25 |
| Trace & analysis views | Full-text search (UC08), audit trails, consistency conflicts, what-if preview, overdue highlighting | PRs #18, #21, #24 |
| Meeting snapshots | Graph snapshots, snapshot diff, i18n (EN/ZH) | PRs #21, #22 |
| Presentation-feedback round | Decision goals (rationale required), batch confirm, duplicate detection, summaries, consistency sweep | PRs #26, #27 |
| Deliberation layer | Argument entity, EN+ZH argument extraction, contested state, deliberation view, search coverage, cascade rules, decision health metrics | PRs #28, #29 |
| Analyst layer (superseded) | Decision pre-check gate, reversal trace, severity-weighted impact cascade — replaced by the repositioning (see below) and removed in the cleanup | PRs #30, #31 |
| Deliberation layer (superseded) | Argument entity, contested state, deliberation view, decision health — replaced by per-node chain discussion and supervisor verdicts; removed in the cleanup | PRs #28, #29 |
| **Repositioning (the current system)** | Two-sided supervisor/group model: decision chains with per-node discussion, inline supervisor review with per-node annotate/approve/hold/reject, approval-as-selection with chain locking, execution phase per approved decision (tasks, topological order, AI checks), project-scoped numbering, two-group seed scenario, dead-code sweep | branch `feat/decision-chain`, PR #37 (squashed) |
| Design documents (Part II) | Architecture, data model, UI design, API spec, change log, summary, models, issues, references — AI-drafted, team-reviewed | `docs/design/` |
| Presentation | Week 9 deck + script | `Desktop/DecisionTrace_设计展示.pptx` |

## 2. Proposed Allocation (CONFIRM / EDIT)

GitHub handles map to names by the SRS role table: `wyz-water` = 王耀增
(team lead, API, review), `chaojizhu7` = 李灏文 (frontend design),
`regretofice` = 陈昊宗 (backend logic), `domainthefesh` = 农国达
(testing, problem discovery). Verify this mapping before submission.

| Member | Proposed areas | Part I | Part II | % of total |
|---|---|---|---|---|
| 王耀增 | Repo maintenance, PR review & merges of every PR, graph core, AI pipeline, presentation-feedback features, consistency sweeps, deliberation layer, analyst layer, this document set | SRS coordination | Presentation, design docs, review & merge | 40% |
| 陈昊宗 | Snapshot diff and i18n (PR #22), change impact detector — what-if preview over the dependency graph (PR #24) | | i18n + snapshot diff, impact detector | 20% |
| 李灏文 | Discussion file upload, prerequisite review panel, project switcher, deletions (PR #16) | | Intake UX, project switcher, prereq panel | 20% |
| 农国达 | Manual decision/commitment creation forms (PR #25); end-to-end scenario testing and defect reporting per the SRS role | | Manual create forms, E2E verification feedback | 20% |

## 3. AI Assistance Disclosure

As stated in the AI tools reflection: drafting (documents and code) was
done with AI assistance in every area listed above, and every area was
human-reviewed before merge — each PR was reviewed by at least one
teammate, built, and verified end-to-end. The percentages above reflect
*human* work: who decided, reviewed, verified and fixed, not who typed.

## 4. Confirmation Checklist

- [ ] Name-to-area mapping matches what each member actually did
- [ ] Percentages filled and sum to 100%
- [ ] Every PR in the repository is claimed by someone
- [ ] The disclosure in §3 is accurate for the final submission
