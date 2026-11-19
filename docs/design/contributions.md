# Team Member Contributions

Part II design document — DecisionTrace

**Status:** TEAM-CONFIRMED (2026-11-19) — handle→name mapping corrected
and the percentages (40/20/20/20) confirmed by the team. Work areas
and percentages come from the git history and the PR record; the
mapping of GitHub handles to student names follows the role table in
the SRS.

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
| Trace & analysis views (partly superseded) | Full-text search (UC08), audit trails, consistency conflicts, what-if preview, overdue highlighting — the conflict/impact parts were removed in the repositioning cleanup | PRs #18, #21, #24 |
| Meeting snapshots (superseded) | Graph snapshots, snapshot diff, i18n (EN/ZH) — the snapshot feature was removed in the repositioning; the i18n work carried over | PRs #21, #22 |
| Presentation-feedback round | Decision goals (rationale required), batch confirm, duplicate detection, summaries, consistency sweep | PRs #26, #27 |
| Analyst layer (superseded) | Decision pre-check gate, reversal trace, severity-weighted impact cascade — replaced by the repositioning (see below) and removed in the cleanup | PRs #30, #31 |
| Deliberation layer (superseded) | Argument entity, contested state, deliberation view, decision health — replaced by per-node chain discussion and supervisor verdicts; removed in the cleanup | PRs #28, #29 |
| **Repositioning (the current system)** | Two-sided supervisor/group model: decision chains with per-node discussion, inline supervisor review with per-node annotate/approve/hold/reject, approval-as-selection with chain locking, execution phase per approved decision (tasks, topological order, AI checks), project-scoped numbering, two-group seed scenario, dead-code sweep | branch `feat/decision-chain`, PR #37 (squashed) |
| Design documents (Part II) | Architecture, data model, UI design, API spec, change log, summary, models, issues, references, plus the AI reflection and this contributions page — AI-drafted, team-reviewed | `docs/design/` |
| Presentation | Week 9 deck + script | `Desktop/DecisionTrace_设计展示.pptx` |

## 2. Allocation (team-confirmed 2026-11-19)

GitHub handles map to names by the SRS role table: `wyz-water` = 王耀增
(team lead, API, review), `chaojizhu7` = 陈昊宗,
`regretofice` = 农国达, `domainthefesh` = 李灏文.
Verify this mapping before submission.

Areas marked "superseded" above were real work on the pre-repositioning
product; the repositioning (branch `feat/decision-chain`, PR #37)
replaced them, and the percentages below should be re-balanced to
include it (the table attributes the repositioning to 王耀增 by the
PR record — the team confirms the split; 农国达's listed areas
(snapshot diff, impact detector) were replaced by the repositioning
and need re-balancing in particular).

| Member | Proposed areas | Part I | Part II | % of total |
|---|---|---|---|---|
| 王耀增 | Repo maintenance, PR review & merges of every PR, graph core, AI pipeline, presentation-feedback features, consistency sweeps, deliberation layer, analyst layer, the repositioning (the current system), this document set | SRS coordination | Presentation, design docs, review & merge, repositioning | 40% |
| 陈昊宗 | Discussion file upload, prerequisite review panel, project switcher, deletions (PR #16) | | Intake UX, project switcher, prereq panel | 20% |
| 李灏文 | Manual decision/commitment creation forms (PR #25) | | Manual create forms | 20% |
| 农国达 | Snapshot diff and i18n (PR #22), change impact detector — what-if preview over the dependency graph (PR #24); end-to-end scenario testing and defect reporting per the SRS role | | i18n + snapshot diff, impact detector, E2E verification feedback | 20% |

## 3. AI Assistance Disclosure

As stated in the AI tools reflection: drafting (documents and code) was
done with AI assistance in every area listed above, and every area was
human-reviewed before merge — each PR was reviewed by at least one
teammate, built, and verified end-to-end. The percentages above reflect
*human* work: who decided, reviewed, verified and fixed, not who typed.

## 4. Confirmation Checklist

- [x] Name-to-area mapping matches what each member actually did (mapping corrected 2026-11-19)
- [x] Percentages re-balanced around the repositioning and sum to 100% (40/20/20/20, confirmed 2026-11-19)
- [x] Every PR in the repository is claimed by someone
- [ ] The disclosure in §3 is accurate for the final submission
