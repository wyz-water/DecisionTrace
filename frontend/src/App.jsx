import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function StatusBadge({ status }) {
  const className = `status-badge status-${status.toLowerCase()}`;
  return <span className={className}>{status.replace("_", " ")}</span>;
}

function App() {
  const [decision, setDecision] = useState(null);
  const [commitments, setCommitments] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [impact, setImpact] = useState(null);
  const [history, setHistory] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [updating, setUpdating] = useState(false);

 async function loadDashboard() {
  try {
    setError("");

    const [
      decisionsResponse,
      commitmentsResponse,
      dependenciesResponse,
    ] = await Promise.all([
      fetch(`${API_URL}/decisions`),
      fetch(`${API_URL}/commitments`),
      fetch(`${API_URL}/dependencies`),
    ]);

    if (
      !decisionsResponse.ok ||
      !commitmentsResponse.ok ||
      !dependenciesResponse.ok
    ) {
      throw new Error("Failed to load dashboard data");
    }

    const decisionsData = await decisionsResponse.json();
    const commitmentsData = await commitmentsResponse.json();
    const dependenciesData = await dependenciesResponse.json();

    setDecision(decisionsData[0] || null);
    setCommitments(commitmentsData);
    setDependencies(dependenciesData);

    const trackedCommitmentId =
      dependenciesData.length > 0
        ? dependenciesData[0].predecessor_commitment_id
        : commitmentsData[0]?.id;

    if (!trackedCommitmentId) {
      setImpact(null);
      setHistory([]);
      return;
    }

    const [impactResponse, historyResponse] = await Promise.all([
      fetch(
        `${API_URL}/commitments/${trackedCommitmentId}/impact`
      ),
      fetch(
        `${API_URL}/commitments/${trackedCommitmentId}/history`
      ),
    ]);

    if (!impactResponse.ok || !historyResponse.ok) {
      throw new Error("Failed to load traceability data");
    }

    const impactData = await impactResponse.json();
    const historyData = await historyResponse.json();

    setImpact(impactData);
    setHistory(historyData);
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}

async function updateCommitmentStatus(commitmentId) {
  if (!newStatus) {
    return;
  }

  try {
    setUpdating(true);

    const response = await fetch(
      `${API_URL}/commitments/${commitmentId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: newStatus,
          reason: reason || null,
        }),
      }
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "Failed to update status");
    }

    setEditingId(null);
    setNewStatus("");
    setReason("");

    await loadDashboard();
  } catch (err) {
    setError(err.message);
  } finally {
    setUpdating(false);
  }
}

useEffect(() => {
  loadDashboard();
}, []);

  if (loading) {
    return <div className="message">Loading DecisionTrace...</div>;
  }

  if (error) {
    return <div className="message error">Error: {error}</div>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="brand">DecisionTrace</div>
          <div className="brand-subtitle">
            Decision intelligence & traceability
          </div>
        </div>

        <div className="project-label">
          DecisionTrace Development
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <p className="eyebrow">PROJECT OVERVIEW</p>
          <h1>Trace decisions to downstream impact.</h1>
          <p>
            Preserve the reasoning behind decisions, connect commitments,
            and understand what changes affect next.
          </p>
        </section>

        <div className="dashboard-grid">
          <section className="card decision-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">DECISION</p>
                <h2>{decision?.title || "No decision"}</h2>
              </div>

              {decision && <StatusBadge status={decision.status} />}
            </div>

            <div className="rationale">
              <span>Rationale</span>
              <p>{decision?.rationale || "No rationale recorded."}</p>
            </div>

            <div className="trace-source">
              Source discussion #{decision?.source_discussion_id ?? "—"}
            </div>
          </section>

          <section
            className={`card impact-card ${
              impact?.has_impact ? "impact-active" : ""
            }`}
          >
            <p className="eyebrow">IMPACT ANALYSIS</p>

            <h2>
              {impact?.has_impact
                ? "Downstream impact detected"
                : "No active impact"}
            </h2>

            {impact?.has_impact ? (
              impact.affected_commitments.map((item) => (
                <div className="impact-item" key={item.id}>
                  <strong>{item.owner}</strong>
                  <p>{item.reason}</p>
                </div>
              ))
            ) : (
              <p className="muted">
                Current commitment states do not trigger a downstream risk.
              </p>
            )}
          </section>
        </div>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">EXECUTION</p>
              <h2>Commitments</h2>
            </div>
            <span>{commitments.length} commitments</span>
          </div>

          <div className="commitment-grid">
            {commitments.map((commitment) => (
              <article className="card commitment-card" key={commitment.id}>
                <div className="commitment-top">
                  <div className="avatar">
                    {commitment.owner.charAt(0)}
                  </div>

                  <div>
                    <h3>{commitment.owner}</h3>
                    <span>Commitment #{commitment.id}</span>
                  </div>

                  <StatusBadge status={commitment.status} />
                </div>

                <p className="commitment-description">
                  {commitment.description}
                </p>

                <div className="due-date">
                  <span>Due date</span>
                  <strong>{commitment.due_date || "Not set"}</strong>
                </div>
                {editingId === commitment.id ? (
                  <div className="status-editor">
                  <select
                    value={newStatus}
                    onChange={(event) => setNewStatus(event.target.value)}
                  >
                  <option value="">Select status</option>
                  <option value="OPEN">Open</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="DELAYED">Delayed</option>
                  <option value="BLOCKED">Blocked</option>
                  <option value="COMPLETED">Completed</option>
                  </select>
                  
                  <input
                    type="text"
                    placeholder="Reason for this change"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />

                  <div className="editor-actions">
                  <button
                    className="primary-button"
                    disabled={updating || !newStatus}
                    onClick={() => updateCommitmentStatus(commitment.id)}
                  >
                  {updating ? "Updating..." : "Update Status"}
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEditingId(null);
                      setNewStatus("");
                      setReason("");
                    }}
                  >
                  Cancel
                  </button>
                  </div>
                  </div>
                  ) : (
                  <button
                    className="change-button"
                    onClick={() => {
                    setEditingId(commitment.id);
                    setNewStatus("");
                    setReason("");
                  }}
                  >
                  Change status
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>

        <div className="dashboard-grid lower-grid">
          <section className="card">
            <p className="eyebrow">DEPENDENCY TRACE</p>
            <h2>Work dependencies</h2>

            {dependencies.map((dependency) => {
              const predecessor = commitments.find(
                (item) =>
                  item.id === dependency.predecessor_commitment_id
              );

              const successor = commitments.find(
                (item) =>
                  item.id === dependency.successor_commitment_id
              );

              return (
                <div className="dependency" key={dependency.id}>
                  <div className="dependency-node">
                    <strong>{predecessor?.owner || "Unknown"}</strong>
                    <span>Commitment #{dependency.predecessor_commitment_id}</span>
                  </div>

                  <div className="dependency-arrow">
                    <span>{dependency.dependency_type}</span>
                    <div>→</div>
                  </div>

                  <div className="dependency-node">
                    <strong>{successor?.owner || "Unknown"}</strong>
                    <span>Commitment #{dependency.successor_commitment_id}</span>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card">
            <p className="eyebrow">AUDIT TRAIL</p>
            <h2>Change history</h2>

            {history.length > 0 ? (
              <div className="timeline">
                {history.map((item) => (
                  <div className="timeline-item" key={item.id}>
                    <div className="timeline-dot" />

                    <div>
                      <strong>
                        {item.old_status.replace("_", " ")}
                        {" → "}
                        {item.new_status.replace("_", " ")}
                      </strong>

                      <p>{item.reason || "No reason provided."}</p>

                      <span>
                        {new Date(item.changed_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No changes recorded yet.</p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;