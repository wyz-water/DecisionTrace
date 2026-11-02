import { useState } from "react";

import Pagination from "./Pagination";

const API_URL = "http://127.0.0.1:8000";

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
      { key: "title", label: "Title" },
      { key: "rationale", label: "Rationale" },
    ];
  }

  if (candidate.candidate_type === "COMMITMENT") {
    return [
      { key: "owner", label: "Owner" },
      { key: "description", label: "Description" },
      { key: "due_date", label: "Due date" },
      { key: "decision_title", label: "Linked decision" },
    ];
  }

  return [
    { key: "predecessor_owner", label: "Predecessor" },
    { key: "successor_owner", label: "Successor" },
  ];
}

export default function CandidatesPanel({ pending, reviewed, reload }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectComment, setRejectComment] = useState("");
  const [error, setError] = useState("");

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
        throw new Error(data.detail || "Failed to save candidate");
      }

      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirm(candidateId) {
    setBusyId(candidateId);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/candidates/${candidateId}/confirm`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to confirm candidate");
      }

      await reload();
    } catch (err) {
      setError(err.message);
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
        throw new Error(data.detail || "Failed to reject candidate");
      }

      setRejectingId(null);
      setRejectComment("");
      await reload();
    } catch (err) {
      setError(err.message);
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
      <div className="candidate-card" key={candidate.id}>
        <div className="candidate-top">
          <span className={`type-badge type-${candidate.candidate_type.toLowerCase()}`}>
            {candidate.candidate_type}
          </span>

          <StatusBadge status={candidate.status} />

          <span className="candidate-source">
            from discussion #{candidate.discussion_id}
          </span>
        </div>

        {candidate.source_text && (
          <p className="candidate-excerpt">"{candidate.source_text}"</p>
        )}

        <div className="candidate-fields">
          {fields.map((field) => (
            <div className="field-row" key={field.key}>
              <span>{field.label}</span>

              {editing ? (
                <input
                  type="text"
                  value={values[field.key] ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, [field.key]: event.target.value })
                  }
                />
              ) : (
                <strong>
                  {values[field.key] || "—"}
                </strong>
              )}
            </div>
          ))}
        </div>

        {candidate.review_comment && (
          <p className="candidate-comment">
            Review note: {candidate.review_comment}
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
                  Save
                </button>

                <button
                  className="secondary-button"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="secondary-button"
                onClick={() => startEdit(candidate)}
              >
                Edit
              </button>
            )}

            <button
              className="primary-button confirm-button"
              disabled={busyId === candidate.id || editing}
              onClick={() => confirm(candidate.id)}
            >
              {busyId === candidate.id ? "Working..." : "Confirm"}
            </button>

            {rejecting ? (
              <>
                <input
                  type="text"
                  placeholder="Why reject?"
                  value={rejectComment}
                  onChange={(event) => setRejectComment(event.target.value)}
                />

                <button
                  className="secondary-button reject-button"
                  disabled={busyId === candidate.id}
                  onClick={() => reject(candidate.id)}
                >
                  Confirm reject
                </button>
              </>
            ) : (
              <button
                className="secondary-button reject-button"
                disabled={busyId === candidate.id || editing}
                onClick={() => setRejectingId(candidate.id)}
              >
                Reject
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
      <p className="eyebrow">AI CANDIDATES</p>
      <h2>Human review</h2>

      {error && <p className="pipeline-error">{error}</p>}

      {pending.total > 0 && (
        <>
          <h3 className="candidate-group">
            Pending review ({pending.total})
          </h3>

          <div
            className={pending.loading ? "candidate-grid is-loading" : "candidate-grid"}
            aria-busy={pending.loading}
          >
            {pending.items.map(renderCard)}
          </div>

          <Pagination
            total={pending.total}
            limit={pending.limit}
            offset={pending.offset}
            onChange={pending.setOffset}
            label="Pending candidates"
            busy={pending.loading}
          />
        </>
      )}

      {reviewed.total > 0 && (
        <>
          <h3 className="candidate-group">
            Reviewed ({reviewed.total})
          </h3>

          <div
            className={reviewed.loading ? "candidate-grid is-loading" : "candidate-grid"}
            aria-busy={reviewed.loading}
          >
            {reviewed.items.map(renderCard)}
          </div>

          <Pagination
            total={reviewed.total}
            limit={reviewed.limit}
            offset={reviewed.offset}
            onChange={reviewed.setOffset}
            label="Reviewed candidates"
            busy={reviewed.loading}
          />
        </>
      )}

      {!hasAny && (
        <p className="muted">
          No candidates yet. Save a discussion above and run extraction.
        </p>
      )}

      {pending.error && <p className="pipeline-error">{pending.error}</p>}
      {reviewed.error && <p className="pipeline-error">{reviewed.error}</p>}
    </section>
  );
}

function StatusBadge({ status }) {
  const className = `status-badge status-${status.toLowerCase()}`;
  return <span className={className}>{status}</span>;
}
