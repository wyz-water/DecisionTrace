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

  useEffect(() => {
    async function loadDashboard() {
      try {
        const responses = await Promise.all([
          fetch(`${API_URL}/decisions`),
          fetch(`${API_URL}/commitments`),
          fetch(`${API_URL}/dependencies`),
          fetch(`${API_URL}/commitments/1/impact`),
          fetch(`${API_URL}/commitments/1/history`),
        ]);

        if (responses.some((response) => !response.ok)) {
          throw new Error("Failed to load dashboard data");
        }

        const [
          decisionsData,
          commitmentsData,
          dependenciesData,
          impactData,
          historyData,
        ] = await Promise.all(
          responses.map((response) => response.json())
        );

        setDecision(decisionsData[0] || null);
        setCommitments(commitmentsData);
        setDependencies(dependenciesData);
        setImpact(impactData);
        setHistory(historyData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

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