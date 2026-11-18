import { useEffect, useState } from "react";

import Pagination from "./Pagination";
import StatusBadge from "./StatusBadge";
import { useI18n } from "../i18n";
import { personColor } from "../personColors";

const API_URL = "http://127.0.0.1:8000";

function backendDetail(data) {
  return typeof data.detail === "string"
    ? data.detail
    : data.detail?.message;
}

function candidateFields(candidate) {
  if (candidate.candidate_type === "DECISION") {
    return [
      { key: "title", labelKey: "candidates.field.title" },
      { key: "rationale", labelKey: "candidates.field.rationale" },
      { key: "decided_by", labelKey: "candidates.field.decidedBy" },
    ];
  }

  return [];
}

/**
 * The review queue: extracted decision candidates, color-coded by
 * their maker, with a per-person filter ("review mine"). Each maker
 * confirms their own decisions — the only gate is the human.
 */
export default function CandidatesPanel({
  pending,
  reviewed,
  reload,
  projectId,
  refreshKey = 0,
}) {
  const { t, te } = useI18n();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectComment, setRejectComment] = useState("");
  const [error, setError] = useState("");
  const [makerFilter, setMakerFilter] = useState(null);
  const [makers, setMakers] = useState([]);
  const [mine, setMine] = useState(null);

  // The full maker list for the "review mine" chips (across pages).
  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;

    fetch(
      `${API_URL}/candidates?project_id=${projectId}&status=PENDING&limit=100`
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) {
          return;
        }
        setMakers([
          ...new Set(
            (data?.items ?? [])
              .filter(
                (item) =>
                  item.candidate_type === "DECISION" &&
                  item.payload?.decided_by
              )
              .map((item) => item.payload.decided_by)
          ),
        ]);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey, pending.total]);

  // The filtered queue when a maker chip is active.
  useEffect(() => {
    if (!projectId || !makerFilter) {
      setMine(null);
      return;
    }

    let cancelled = false;
    setMine({ loading: true, items: [] });

    fetch(
      `${API_URL}/candidates?project_id=${projectId}&status=PENDING` +
        `&decided_by=${encodeURIComponent(makerFilter)}&limit=50`
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) {
          return;
        }

        const items = data?.items ?? [];
        setMine({ loading: false, items });

        // Nothing left to review for this maker: clear the filter
        // automatically instead of leaving an empty queue.
        if (items.length === 0) {
          setMakerFilter(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMine({ loading: false, items: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, makerFilter, refreshKey]);

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
        throw new Error(
          te(backendDetail(data)) || t("candidates.failedConfirm")
        );
      }

      await reload();
    } catch (err) {
      setError(te(err.message) || t("candidates.failedConfirm"));
    } finally {
      setBusyId(null);
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

    const makerColor =
      candidate.candidate_type === "DECISION" &&
      candidate.payload?.decided_by
        ? personColor(candidate.payload.decided_by)
        : null;

    return (
      <div
        className="candidate-card"
        id={`candidate-${candidate.id}`}
        key={candidate.id}
        style={
          makerColor
            ? {
                borderLeft: `4px solid ${makerColor}`,
                background: `${makerColor}0a`,
              }
            : undefined
        }
      >
        <div className="candidate-top">
          <span
            className={`type-badge type-${candidate.candidate_type.toLowerCase()}`}
          >
            {t(`candidates.type.${candidate.candidate_type}`, {}, candidate.candidate_type)}
          </span>

          {candidate.candidate_type === "DECISION" &&
            candidate.payload?.decided_by && (
              <span
                className="maker-chip"
                style={{
                  borderColor: makerColor,
                  color: makerColor,
                }}
              >
                {candidate.payload.decided_by}
              </span>
            )}

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
      </div>
    );
  }

  const hasAny = pending.total > 0 || reviewed.total > 0;

  return (
    <section className="card pipeline-card">
      <p className="eyebrow">{t("candidates.eyebrow")}</p>
      <h2>{t("candidates.title")}</h2>

      {error && <p className="pipeline-error">{te(error)}</p>}

      {pending.total > 0 && (
        <>
          <h3 className="candidate-group">
            {t("candidates.pending", { count: pending.total })}
          </h3>

          {makers.length > 0 && (
            <div className="maker-filter-row">
              <span className="maker-filter-label">
                {t("candidates.reviewMine")}
              </span>

              {makers.map((maker) => (
                <button
                  type="button"
                  key={maker}
                  className={`maker-chip maker-chip-button ${
                    makerFilter === maker ? "is-active" : ""
                  }`}
                  style={{
                    borderColor: personColor(maker),
                    color: makerFilter === maker ? "#ffffff" : personColor(maker),
                    background: makerFilter === maker ? personColor(maker) : "transparent",
                  }}
                  onClick={() =>
                    setMakerFilter(
                      makerFilter === maker ? null : maker
                    )
                  }
                >
                  {maker}
                </button>
              ))}
            </div>
          )}

          <div
            className={
              pending.loading
                ? "candidate-grid is-loading"
                : "candidate-grid"
            }
            aria-busy={pending.loading}
          >
            {(makerFilter ? mine?.items ?? [] : pending.items).map(
              renderCard
            )}
          </div>

          {!makerFilter && (
            <Pagination
              total={pending.total}
              limit={pending.limit}
              offset={pending.offset}
              onChange={pending.setOffset}
              label={t("candidates.pendingLabel")}
              busy={pending.loading}
            />
          )}
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
