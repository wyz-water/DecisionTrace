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
  const [prereqFor, setPrereqFor] = useState(null);
  const [prereqData, setPrereqData] = useState(null);

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
        throw new Error("Could not load the prerequisite commitments.");
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
      setPrereqData({ loading: false, rows: [], error: err.message });
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

        // The confirm endpoint answers 409 with a structured detail
        // (cycle rejection carries code/message/hops), unlike the plain
        // strings the edit endpoints return.
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : data.detail?.message;

        throw new Error(detail || "Failed to confirm candidate");
      }

      await reload();
    } catch (err) {
      setError(err.message);

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
      <div className="candidate-card" id={`candidate-${candidate.id}`} key={candidate.id}>
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
              onClick={() => confirm(candidate)}
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

        {candidate.status === "PENDING" &&
          candidate.candidate_type === "DEPENDENCY" && (
            <div className="prereq-box">
              <button
                type="button"
                className="secondary-button"
                onClick={() => togglePrerequisites(candidate)}
              >
                {prereqFor === candidate.id
                  ? "Hide prerequisite commitments"
                  : "Review prerequisite commitments"}
              </button>

              {prereqFor === candidate.id && prereqData && (
                <div className="prereq-panel">
                  <p className="prereq-hint">
                    A dependency links two commitments. Confirm both
                    commitments below first, then confirm this dependency.
                  </p>

                  {prereqData.loading && <p className="muted">Loading...</p>}
                  {prereqData.error && (
                    <p className="pipeline-error">{prereqData.error}</p>
                  )}

                  {prereqData.rows.map((row) => (
                    <div className="prereq-row" key={row.role}>
                      <div className="prereq-owner">
                        <strong>{row.owner}</strong>
                        <span className="prereq-role">{row.role}</span>
                      </div>

                      <div className="prereq-items">
                        {row.pending.length > 0 ? (
                          row.pending.map((item) => (
                            <div className="prereq-item" key={item.id}>
                              <div>
                                <span className="prereq-state state-pending">
                                  PENDING
                                </span>
                                <strong>{item.payload.description}</strong>
                                {item.payload.due_date && (
                                  <span className="prereq-due">
                                    due {item.payload.due_date}
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
                                {busyId === item.id ? "Working..." : "Confirm"}
                              </button>
                            </div>
                          ))
                        ) : row.confirmed ? (
                          <div className="prereq-item">
                            <div>
                              <span className="prereq-state state-ok">
                                CONFIRMED
                              </span>
                              <span>
                                {row.owner}'s commitment already exists.
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="prereq-item">
                            <div>
                              <span className="prereq-state state-missing">
                                NOT FOUND
                              </span>
                              <span>
                                No commitment for {row.owner} yet — check the
                                name, or create the commitment first.
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
