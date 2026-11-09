# Requirements Change Log (SRS → Design)

Part II design document — DecisionTrace

**Status:** Draft for team review (2026-11-09)
**Baseline:** `docs/SRS/srs.md` (submitted 2026-10-23)

Every requirement change between the SRS baseline and the Part II design,
with its reason and evidence. The SRS itself stays untouched: this log is
the authoritative record of how the design evolved.

| # | Change | SRS baseline | Design decision | Reason | Evidence |
|---|---|---|---|---|---|
| C1 | Extraction runs automatically on file import | UC01 step 4: extraction is opt-in, default off | Importing a discussion triggers extraction immediately (rule engine by default; the LLM runs only when `DEEPSEEK_API_KEY` is configured, so the SRS privacy opt-in is retained for the LLM path) | Instructor feedback point 1: the human's job should be verifying, not transcribing | PR #20, #26 |
| C2 | Rationale (decision goal) required on manual creation | UC04: create a decision; fields not further constrained | `POST /decisions` rejects an empty rationale with 400; the create form requires it; revision may change but never erase the rationale. Decisions confirmed from candidates are exempt — their goal context is the source discussion | Instructor feedback point 0: decision goals must be explicit and recorded | PR #26, `fix/consistency` |
| C3 | Batch confirmation in the review queue | UC03: review each candidate one by one | Select-all-per-page + confirm-selected sends one request; per-item failures are reported; candidates flagged as duplicates are skipped by default (single confirm remains available) | Instructor feedback point 1: reduce review burden | PR #26 |
| C4 | Duplicate detection against authoritative records | UC02/UC03: extraction dedupes only against its own candidates | Pending candidates matching an existing decision / commitment / dependency carry `duplicate_of` (e.g. "Decision #3"), computed on read; title matching tolerates the extractor's cleaning ("Use Redis" ≡ "Redis") | Same fact re-stated in a meeting should not re-enter the trace unnoticed | PR #26 |
| C5 | Rule-based meeting summary on every discussion | Not in SRS (summary was implicit in the graph-snapshot idea, §2.3) | Every discussion response carries a computed summary (decisions / commitments / dependencies with names) from the rule engine only — offline, deterministic, never via the LLM; one click saves the current graph as the meeting snapshot | Instructor feedback point 1 + SRS core idea "meeting summary = graph snapshot" | PR #26 |
| C6 | What-if impact preview | UC07: impact is reported for actual DELAYED/BLOCKED states | New read-only endpoint `GET /commitments/{id}/what-if?status=DELAYED|BLOCKED` previews the hypothetical downstream closure, split into newly vs already affected; never writes a history row | UC07's "possible impact" made interactive without risk | PR #24 |
| C7 | Overdue highlighting | Commitment `due_date` is informational | Overview shows an attention entry and the plan view marks overdue commitments red | Demo feedback: due dates should be visible, not just stored | PR #21 |
| C8 | Discussion file import | UC01: paste a transcript or type a note | `.txt/.md/.docx/.pdf` import with drag & drop, UTF-8 with GBK fallback | The team's notes are mixed-format files | PR #20 |
| C9 | Bilingual UI (中文/EN) | SRS written in English; no language requirement | UI toggle with persisted preference; all strings via i18n | Team and course audience are Chinese-speaking; demo readability | PR #22 |
| C10 | Snapshot comparison | SRS §2.3: meeting summary as a graph (idea) | Snapshots are first-class (`POST/GET/DELETE`), with a structural diff between any two | Makes the "graph-structured meeting minutes" idea demonstrable | PR #21, #22 |
| C11 | Status-transition matrix deferred | UC05: "OPEN → IN_PROGRESS → …" implies a full transition rule set | Only the status vocabulary is enforced today; the explicit transition matrix (which jumps are legal) is deliberately deferred to Part III PoC validation | Honest scoping: rules need pilot data, not guesses | `docs/design/architecture.md` §10 R1, module-plan |
| C12 | Dependency editing deferred | UC06: create and inspect dependencies | Creation/removal implemented; editing an existing edge (change type/endpoints) deferred to Part III | Graph integrity checks made edit-by-edit safer to postpone | `docs/design/architecture.md` §10 R5, module-plan |

Unchanged from SRS: the four core concepts, the candidate gate (A2 /
UC02–UC03), cycle refusal before storage, the append-only history tables,
and the AI autonomy boundaries of §7.6.
