# Team Member Contributions

Part II design document — DecisionTrace

**Status:** DRAFT ALLOCATION — the team must confirm. The work areas
below are taken from the git history and the PR record; the mapping of
names to areas is a proposal, because the repository records GitHub
handles, not student names. Edit this table to match what each member
actually did, and fill the percentages so the column sums to 100%.

Team (from the SRS): 王耀增 2451393, 农国达 2453193, 李灏文 2453192,
陈昊宗 2453197.

## 1. Work Areas (as the repository records them)

| Area | What happened | Evidence |
|---|---|---|
| Idea submission & SRS (Part I) | All 11 SRS sections drafted with AI assistance, revised per instructor feedback; submission zip built | SRS, `docs/SRS/` |
| Graph core | Graph payload, topological order, cycle detection, impact closure; cycle rejection on edge creation | PRs #6, #8 |
| AI candidate pipeline | Extraction (rules + DeepSeek), candidate review UI, confirm/edit/reject, dedup, prerequisite panel | PRs #7, #9, #16 |
| Intake & file handling | Discussion upload (.txt/.md/.docx/.pdf, GBK fallback), drag & drop, project switcher, deletions | PR #16, #20 |
| Trace & analysis views | Full-text search (UC08), audit trails, consistency conflicts, what-if preview, overdue highlighting | PRs #18, #21, #24 |
| Meeting snapshots | Graph snapshots, snapshot diff, i18n (EN/ZH) | PRs #21, #22 |
| Presentation-feedback round | Decision goals (rationale required), batch confirm, duplicate detection, summaries, consistency sweep | PRs #26, #27 |
| Deliberation layer (this revision) | Argument entity, EN+ZH argument extraction, contested state, deliberation view, search coverage, cascade rules, decision health metrics | PR #28 + in-flight branch |
| Design documents (Part II) | Architecture, data model, UI design, API spec, change log, summary, models, issues, references — AI-drafted, team-reviewed | `docs/design/` |
| Presentation | Week 9 deck + script | `Desktop/DecisionTrace_设计展示.pptx` |

## 2. Draft Allocation (CONFIRM / EDIT)

| Member | Proposed areas | Part I | Part II | % of total (fill in) |
|---|---|---|---|---|
| 王耀增 | Repo maintenance, PR review & merges, presentation-feedback features, consistency sweeps, deliberation layer, this document set | SRS coordination | Presentation, design docs | |
| 农国达 | (fill in) | | | |
| 李灏文 | (fill in) | | | |
| 陈昊宗 | (fill in) | | | |

## 3. AI Assistance Disclosure

As stated in the AI tools reflection: drafting (documents and code) was
done with AI assistance in every area listed above, and every area was
human-reviewed before merge — each PR was reviewed by at least one
teammate, built, and verified end-to-end. The percentages above should
reflect *human* work: who decided, reviewed, verified and fixed, not
who typed.

## 4. Confirmation Checklist

- [ ] Name-to-area mapping matches what each member actually did
- [ ] Percentages filled and sum to 100%
- [ ] Every PR in the repository is claimed by someone
- [ ] The disclosure in §3 is accurate for the final submission
