import { useState } from "react";

import Pagination from "./Pagination";
import StatusBadge from "./StatusBadge";
import { useI18n } from "../i18n";

const API_URL = "http://127.0.0.1:8000";

function backendDetail(data) {
  return typeof data.detail === "string"
    ? data.detail
    : data.detail?.message;
}

/**
 * Constraint brief (refactoring-ui, Workflow B):
 *   primary   = "Confirm" (the one filled button on a pending card; it is
 *               the only action that creates an authoritative record)
 *   secondary = "Edit" and the source excerpt that justifies the record
 *   tertiary  = "Reject", the review-note field, and both pagers
 * The two queues ("Pending review", "Reviewed") are separate paginated
 * lists: confirming an item moves it from one to the other, and paging
 * one queue must not move the other.
 */
function candidateFields(candidate) {
  if (candidate.candidate_type === "DECISION") {
    return [
      { key: "title", labelKey: "candidates.field.title" },
      { key: "rationale", labelKey: "candidates.field.rationale" },
    ];
  }

  if (candidate.candidate_type === "COMMITMENT") {
    return [
      { key: "owner", labelKey: "candidates.field.owner" },
      { key: "description", labelKey: "candidates.field.description" },
      { key: "due_date", labelKey: "candidates.field.dueDate" },
      { key: "decision_title", labelKey: "candidates.field.decisionTitle" },
    ];
  }

  if (candidate.candidate_type === "ARGUMENT") {
    return [
      { key: "stance", labelKey: "candidates.field.stance" },
      { key: "claim", labelKey: "candidates.field.claim" },
      { key: "author", labelKey: "candidates.field.author" },
      { key: "target_title", labelKey: "candidates.field.targetTitle" },
    ];
  }

  return [
    { key: "predecessor_owner", labelKey: "candidates.field.predecessor" },
    { key: "successor_owner", labelKey: "candidates.field.successor" },
  ];
}

export default function CandidatesPanel({ pending, reviewed, reload }) {
  const { t, te, formatDate } = useI18n();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectComment, setRejectComment] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [prereqFor, setPrereqFor] = useState(null);
  const [prereqData, setPrereqData] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  function startEdit(candidate) {
    setEditingId(candidate.id);
    setDraft({ ...candidate.payload });
  }

  async function saveEdit(candidateId) {
    setBusyId(candidateId);
    setError("");

    try {
      const response = await fetch(`${API_URL}/candidates/${candidateId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: draft }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          te(backendDetail(data)) || t("candidates.failedSave")
        );
      }

      setEditingId(null);
      await reload();
    } catch (err) {
      setError(te(err.message) || t("candidates.failedSave"));
    } finally {
      setBusyId(null);
    }
  }

  function scrollToCard(candidateId) {
    document
      .getElementById(`candidate-${candidateId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function loadPrerequisites(dependency) {
    setPrereqFor(dependency.id);
    setPrereqData({ loading: true, rows: [], error: "" });

    try {
      const response = await fetch(
        `${API_URL}/candidates?project_id=${dependency.project_id}` +
          `&status=PENDING,CONFIRMED&limit=100&offset=0`
      );

      if (!response.ok) {
        throw new Error(t("candidates.prereqLoad"));
      }

      const data = await response.json();
      const items = data.items ?? [];

      const needed = [
        { role: "predecessor", owner: dependency.payload.predecessor_owner },
        { role: "successor", owner: dependency.payload.successor_owner },
      ];

      const rows = needed.map(({ role, owner }) => {
        const key = String(owner ?? "").trim().toLowerCase();

        const matches = items.filter(
          (item) =>
            item.candidate_type === "COMMITMENT" &&
            String(item.payload?.owner ?? "").trim().toLowerCase() === key
        );

        return {
          role,
          owner,
          pending: matches.filter((item) => item.status === "PENDING"),
          confirmed: matches.some((item) => item.status === "CONFIRMED"),
        };
      });

      setPrereqData({ loading: false, rows, error: "" });
    } catch (err) {
      setPrereqData({
        loading: false,
        rows: [],
        error: te(err.message) || t("candidates.prereqLoad"),
      });
    }
  }

  function togglePrerequisites(dependency) {
    if (prereqFor === dependency.id) {
      setPrereqFor(null);
      return;
    }

    loadPrerequisites(dependency);
  }

  async function confirm(candidate) {
    setBusyId(candidate.id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/candidates/${candidate.id}/confirm`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json();

        if (data.detail?.code === "CYCLE_DETECTED") {
          throw new Error(
            t("candidates.cycleConfirm", {
              predecessor:
                data.detail.attempted?.predecessor_owner ?? "?",
              successor: data.detail.attempted?.successor_owner ?? "?",
            })
          );
        }

        // The confirm endpoint answers 409 with a structured detail
        // (cycle rejection carries code/message/hops), unlike the plain
        // strings the edit endpoints return.
        throw new Error(
          te(backendDetail(data)) || t("candidates.failedConfirm")
        );
      }

      await reload();
    } catch (err) {
      setError(te(err.message) || t("candidates.failedConfirm"));

      // A dependency cannot be confirmed before the commitments it links
      // exist. When that happens, open the prerequisite list right where
      // the user is standing instead of leaving them with a bare error.
      if (
        candidate.candidate_type === "DEPENDENCY" &&
        /not found/i.test(err.message)
      ) {
        await loadPrerequisites(candidate);
        scrollToCard(candidate.id);
      }
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(candidateId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }

  async function confirmSelected() {
    setBatchBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/candidates/confirm-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_ids: [...selected] }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          te(backendDetail(data)) || t("candidates.failedBatch")
        );
      }

      const result = await response.json();
      setSelected(new Set());

      if (result.failed.length > 0) {
        const details = result.failed
          .map((item) => `#${item.candidate_id}: ${item.detail}`)
          .join("; ");
        setError(t("candidates.batchFailed", { details }));
      } else {
        setNotice(
          t("candidates.batchResult", {
            confirmed: result.confirmed.length,
            skipped: result.skipped_duplicates.length,
          })
        );
      }

      await reload();
    } catch (err) {
      setError(te(err.message) || t("candidates.failedBatch"));
    } finally {
      setBatchBusy(false);
    }
  }

  async function reject(candidateId) {
    setBusyId(candidateId);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/candidates/${candidateId}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            comment: rejectComment.trim() || null,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          te(backendDetail(data)) || t("candidates.failedReject")
        );
      }

      setRejectingId(null);
      setRejectComment("");
      await reload();
    } catch (err) {
      setError(te(err.message) || t("candidates.failedReject"));
    } finally {
      setBusyId(null);
    }
  }

  function renderCard(candidate) {
    const editing = editingId === candidate.id;
    const rejecting = rejectingId === candidate.id;
    const values = editing ? draft : candidate.payload;
    const fields = candidateFields(candidate);

    return (
      <div
        className="candidate-card"
        id={`candidate-${candidate.id}`}
        key={candidate.id}
      >
        <div className="candidate-top">
          {candidate.status === "PENDING" && !editing && (
            <input
              type="checkbox"
              className="candidate-select"
              checked={selected.has(candidate.id)}
              disabled={batchBusy}
              onChange={() => toggleSelect(candidate.id)}
              aria-label={t("candidates.selectCandidate", {
                id: candidate.id,
              })}
            />
          )}

          <span
            className={`type-badge type-${candidate.candidate_type.toLowerCase()}`}
          >
            {t(`candidates.type.${candidate.candidate_type}`, {}, candidate.candidate_type)}
          </span>

          <StatusBadge status={candidate.status} />

          {candidate.duplicate_of && (
            <span className="dup-badge">
              {t("candidates.duplicateBadge", {
                ref: candidate.duplicate_of,
              })}
            </span>
          )}

          <span className="candidate-source">
            {t("candidates.fromDiscussion", {
              id: candidate.discussion_id,
            })}
          </span>
        </div>

        {candidate.source_text && (
          <p className="candidate-excerpt">“{candidate.source_text}”</p>
        )}

        <div className="candidate-fields">
          {fields.map((field) => (
            <div className="field-row" key={field.key}>
              <span>{t(field.labelKey)}</span>

              {editing ? (
                <input
                  type="text"
                  value={values[field.key] ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, [field.key]: event.target.value })
                  }
                />
              ) : (
                <strong>{values[field.key] || "—"}</strong>
              )}
            </div>
          ))}
        </div>

        {candidate.review_comment && (
          <p className="candidate-comment">
            {t("candidates.reviewNote", {
              note: candidate.review_comment,
            })}
          </p>
        )}

        {candidate.status === "PENDING" && (
          <div className="candidate-actions">
            {editing ? (
              <>
                <button
                  className="primary-button"
                  disabled={busyId === candidate.id}
                  onClick={() => saveEdit(candidate.id)}
                >
                  {t("common.save")}
                </button>

                <button
                  className="secondary-button"
                  onClick={() => setEditingId(null)}
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <button
                className="secondary-button"
                onClick={() => startEdit(candidate)}
              >
                {t("common.edit")}
              </button>
            )}

            <button
              className="primary-button confirm-button"
              disabled={busyId === candidate.id || editing}
              onClick={() => confirm(candidate)}
            >
              {busyId === candidate.id
                ? t("common.working")
                : t("common.confirm")}
            </button>

            {rejecting ? (
              <>
                <input
                  type="text"
                  placeholder={t("candidates.whyReject")}
                  value={rejectComment}
                  onChange={(event) => setRejectComment(event.target.value)}
                />

                <button
                  className="secondary-button reject-button"
                  disabled={busyId === candidate.id}
                  onClick={() => reject(candidate.id)}
                >
                  {t("common.confirmReject")}
                </button>
              </>
            ) : (
              <button
                className="secondary-button reject-button"
                disabled={busyId === candidate.id || editing}
                onClick={() => setRejectingId(candidate.id)}
              >
                {t("common.reject")}
              </button>
            )}
          </div>
        )}

        {candidate.status === "PENDING" &&
          candidate.candidate_type === "DEPENDENCY" && (
            <div className="prereq-box">
              <button
                type="button"
                className="secondary-button"
                onClick={() => togglePrerequisites(candidate)}
              >
                {prereqFor === candidate.id
                  ? t("candidates.hidePrereq")
                  : t("candidates.reviewPrereq")}
              </button>

              {prereqFor === candidate.id && prereqData && (
                <div className="prereq-panel">
                  <p className="prereq-hint">{t("candidates.prereqHint")}</p>

                  {prereqData.loading && (
                    <p className="muted">{t("common.loading")}</p>
                  )}
                  {prereqData.error && (
                    <p className="pipeline-error">{te(prereqData.error)}</p>
                  )}

                  {prereqData.rows.map((row) => (
                    <div className="prereq-row" key={row.role}>
                      <div className="prereq-owner">
                        <strong>{row.owner}</strong>
                        <span className="prereq-role">
                          {t(`candidates.prereqRole.${row.role}`, {}, row.role)}
                        </span>
                      </div>

                      <div className="prereq-items">
                        {row.pending.length > 0 ? (
                          row.pending.map((item) => (
                            <div className="prereq-item" key={item.id}>
                              <div>
                                <span className="prereq-state state-pending">
                                  {t("candidates.prereqPending")}
                                </span>
                                <strong>{item.payload.description}</strong>
                                {item.payload.due_date && (
                                  <span className="prereq-due">
                                    {t("candidates.prereqDue", {
                                      date: formatDate(item.payload.due_date),
                                    })}
                                  </span>
                                )}
                              </div>

                              <button
                                type="button"
                                className="primary-button"
                                disabled={busyId === item.id}
                                onClick={async () => {
                                  await confirm(item);
                                  if (prereqFor === candidate.id) {
                                    loadPrerequisites(candidate);
                                  }
                                }}
                              >
                                {busyId === item.id
                                  ? t("common.working")
                                  : t("common.confirm")}
                              </button>
                            </div>
                          ))
                        ) : row.confirmed ? (
                          <div className="prereq-item">
                            <div>
                              <span className="prereq-state state-ok">
                                {t("candidates.prereqConfirmed")}
                              </span>
                              <span>
                                {t("candidates.prereqExists", {
                                  owner: row.owner,
                                })}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="prereq-item">
                            <div>
                              <span className="prereq-state state-missing">
                                {t("candidates.prereqMissing")}
                              </span>
                              <span>
                                {t("candidates.prereqMissingHint", {
                                  owner: row.owner,
                                })}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
      </div>
    );
  }

  const hasAny = pending.total > 0 || reviewed.total > 0;

  return (
    <section className="card pipeline-card">
      <p className="eyebrow">{t("candidates.eyebrow")}</p>
      <h2>{t("candidates.title")}</h2>

      {error && <p className="pipeline-error">{te(error)}</p>}
      {notice && <p className="pipeline-notice">{te(notice)}</p>}

      {pending.total > 0 && (
        <>
          <h3 className="candidate-group">
            {t("candidates.pending", { count: pending.total })}
          </h3>

          {(() => {
            const pageIds = pending.items.map((item) => item.id);
            const pageSelectedCount = pageIds.filter((id) =>
              selected.has(id)
            ).length;
            const pageAllSelected =
              pageIds.length > 0 && pageSelectedCount === pageIds.length;

            return (
              <div className="batch-bar">
                <label className="batch-select-all">
                  <input
                    type="checkbox"
                    checked={pageAllSelected}
                    disabled={batchBusy || pending.loading}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (pageAllSelected) {
                          pageIds.forEach((id) => next.delete(id));
                        } else {
                          pageIds.forEach((id) => next.add(id));
                        }
                        return next;
                      })
                    }
                  />
                  {t("candidates.selectAll")}
                </label>

                <button
                  type="button"
                  className="primary-button"
                  disabled={pageSelectedCount === 0 || batchBusy}
                  onClick={confirmSelected}
                >
                  {batchBusy
                    ? t("common.working")
                    : t("candidates.confirmSelected", {
                        count: pageSelectedCount,
                      })}
                </button>
              </div>
            );
          })()}

          <div
            className={
              pending.loading
                ? "candidate-grid is-loading"
                : "candidate-grid"
            }
            aria-busy={pending.loading}
          >
            {pending.items.map(renderCard)}
          </div>

          <Pagination
            total={pending.total}
            limit={pending.limit}
            offset={pending.offset}
            onChange={pending.setOffset}
            label={t("candidates.pendingLabel")}
            busy={pending.loading}
          />
        </>
      )}

      {reviewed.total > 0 && (
        <>
          <h3 className="candidate-group">
            {t("candidates.reviewed", { count: reviewed.total })}
          </h3>

          <div
            className={
              reviewed.loading
                ? "candidate-grid is-loading"
                : "candidate-grid"
            }
            aria-busy={reviewed.loading}
          >
            {reviewed.items.map(renderCard)}
          </div>

          <Pagination
            total={reviewed.total}
            limit={reviewed.limit}
            offset={reviewed.offset}
            onChange={reviewed.setOffset}
            label={t("candidates.reviewedLabel")}
            busy={reviewed.loading}
          />
        </>
      )}

      {!hasAny && <p className="muted">{t("candidates.none")}</p>}

      {pending.error && (
        <p className="pipeline-error">{te(pending.error)}</p>
      )}
      {reviewed.error && (
        <p className="pipeline-error">{te(reviewed.error)}</p>
      )}
    </section>
  );
}
