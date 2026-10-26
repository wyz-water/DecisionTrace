import { useEffect, useState } from "react";
import "./App.css";
import DiscussionsPanel from "./components/DiscussionsPanel.jsx";
import CandidatesPanel from "./components/CandidatesPanel.jsx";

const API_URL = "http://127.0.0.1:8000";

const STATUS_COLORS = {
  COMPLETED: { fill: "#eaf8ef", stroke: "#267447", text: "#267447" },
  IN_PROGRESS: { fill: "#eef4ff", stroke: "#315ca8", text: "#315ca8" },
  OPEN: { fill: "#f2f4f7", stroke: "#475467", text: "#475467" },
  DELAYED: { fill: "#fff1f0", stroke: "#b42318", text: "#b42318" },
  BLOCKED: { fill: "#fff1f0", stroke: "#b42318", text: "#b42318" },
};

function StatusBadge({ status }) {
  const className = `status-badge status-${status.toLowerCase()}`;
  return <span className={className}>{status.replace("_", " ")}</span>;
}

function names(ids, byId) {
  return ids.map((id) => byId[id]?.owner ?? `#${id}`).join(", ");
}

function stateNote(analysis, byId) {
  switch (analysis.state) {
    case "DONE":
      return "Done";
    case "READY":
      return "No blockers";
    case "WAITING":
      return `Waiting on ${names(analysis.waiting_on, byId)}`;
    case "BLOCKED":
      return `Blocked by ${names(analysis.blocked_by, byId)}`;
    case "CYCLIC":
      return "Part of a dependency cycle";
    default:
      return "";
  }
}

// --- Graph layout -----------------------------------------------------------

const NODE_W = 170;
const NODE_H = 64;
const LAYER_GAP = 240;
const ROW_GAP = 100;
const PAD = 30;

function computeLayout(graph) {
  const { nodes, edges, topological_order: topo } = graph;

  if (nodes.length === 0) {
    return null;
  }

  const byId = {};
  for (const node of nodes) {
    byId[node.id] = node;
  }

  const predecessors = {};
  for (const edge of edges) {
    (predecessors[edge.successor_commitment_id] ??= []).push(
      edge.predecessor_commitment_id
    );
  }

  const layer = {};
  for (const id of topo) {
    const predLayers = (predecessors[id] ?? [])
      .map((predId) => layer[predId])
      .filter((value) => value != null);

    layer[id] = predLayers.length ? Math.max(...predLayers) + 1 : 0;
  }

  const maxLayer = Math.max(0, ...Object.values(layer));

  const cyclicIds = new Set(
    nodes.filter((node) => !(node.id in layer)).map((node) => node.id)
  );

  const layers = {};
  for (const node of nodes) {
    const column = cyclicIds.has(node.id) ? maxLayer + 1 : layer[node.id];
    (layers[column] ??= []).push(node);
  }

  const positions = {};
  const columnCount = Object.keys(layers).length;
  let maxRows = 0;

  for (const column of Object.keys(layers)) {
    maxRows = Math.max(maxRows, layers[column].length);

    layers[column].forEach((node, index) => {
      positions[node.id] = {
        x: Number(column) * LAYER_GAP + PAD + NODE_W / 2,
        y: index * ROW_GAP + PAD + NODE_H / 2,
      };
    });
  }

  return {
    positions,
    cyclicIds,
    cycleColumn: maxLayer + 1,
    svgWidth: (columnCount - 1) * LAYER_GAP + NODE_W + PAD * 2,
    svgHeight: (maxRows - 1) * ROW_GAP + NODE_H + PAD * 2,
  };
}

function GraphView({ graph, selectedId, onSelect }) {
  const layout = computeLayout(graph);

  if (!layout) {
    return <p className="muted">No commitments to draw yet.</p>;
  }

  const { positions, cyclicIds, cycleColumn, svgWidth, svgHeight } = layout;

  return (
    <div className="graph-wrap">
      <svg
        className="graph-svg"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        role="img"
        aria-label="Dependency graph"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#98a2b3" />
          </marker>
        </defs>

        {graph.edges.map((edge) => {
          const from = positions[edge.predecessor_commitment_id];
          const to = positions[edge.successor_commitment_id];

          if (!from || !to) {
            return null;
          }

          const sameColumn = Math.abs(from.x - to.x) < LAYER_GAP / 2;

          const startX = from.x + NODE_W / 2;
          const endX = to.x + NODE_W / 2;
          const startY = from.y;
          const endY = to.y;

          const d = sameColumn
            ? `M ${startX} ${startY} C ${startX + 70} ${startY}, ${endX + 70} ${endY}, ${endX} ${endY}`
            : `M ${startX} ${startY} L ${to.x - NODE_W / 2} ${endY}`;

          return (
            <path
              className="graph-edge"
              key={edge.id}
              d={d}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {cyclicIds.size > 0 && (
          <g className="cycle-zone">
            <rect
              x={cycleColumn * LAYER_GAP + PAD - 14}
              y={12}
              width={NODE_W + 28}
              height={svgHeight - 24}
              rx={16}
            />
            <text
              x={cycleColumn * LAYER_GAP + PAD + NODE_W / 2}
              y={30}
              textAnchor="middle"
            >
              CYCLE
            </text>
          </g>
        )}

        {graph.nodes.map((node) => {
          const pos = positions[node.id];

          if (!pos) {
            return null;
          }

          const colors = STATUS_COLORS[node.status] ?? STATUS_COLORS.OPEN;
          const selected = node.id === selectedId;

          return (
            <g
              className={`graph-node ${selected ? "selected" : ""}`}
              key={node.id}
              onClick={() => onSelect(node.id)}
            >
              <rect
                x={pos.x - NODE_W / 2}
                y={pos.y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={12}
                fill={colors.fill}
                stroke={selected ? "#172033" : colors.stroke}
                strokeWidth={selected ? 2.5 : 1.5}
              />
              <text
                x={pos.x - NODE_W / 2 + 14}
                y={pos.y - 5}
                fontSize={13}
                fontWeight={800}
                fill="#172033"
              >
                {node.owner}
              </text>
              <text
                x={pos.x - NODE_W / 2 + 14}
                y={pos.y + 15}
                fontSize={10.5}
                fill={colors.text}
              >
                #{node.id} · {node.status.replace("_", " ")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- App ---------------------------------------------------------------------

function App() {
  const [project, setProject] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [decisionId, setDecisionId] = useState(null);
  const [decisionHistory, setDecisionHistory] = useState([]);
  const [decisionImpact, setDecisionImpact] = useState(null);
  const [graph, setGraph] = useState(null);
  const [impact, setImpact] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [discussions, setDiscussions] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [conflicts, setConflicts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [updating, setUpdating] = useState(false);

  const [editingDecision, setEditingDecision] = useState(false);
  const [decisionDraft, setDecisionDraft] = useState({});
  const [updatingDecision, setUpdatingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [decisionTraceError, setDecisionTraceError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  async function loadDashboard(keepSelected = null) {
    try {
      setError("");

      const projectsResponse = await fetch(`${API_URL}/projects`);

      if (!projectsResponse.ok) {
        throw new Error("Failed to load projects");
      }

      const projects = await projectsResponse.json();

      if (projects.length === 0) {
        setError("No projects yet. Create one through the API first.");
        return;
      }

      const activeProject = projects[0];

      const [
        graphResponse,
        decisionsResponse,
        discussionsResponse,
        candidatesResponse,
        conflictsResponse,
      ] = await Promise.all([
        fetch(`${API_URL}/projects/${activeProject.id}/graph`),
        fetch(`${API_URL}/decisions?project_id=${activeProject.id}`),
        fetch(`${API_URL}/discussions?project_id=${activeProject.id}`),
        fetch(`${API_URL}/candidates?project_id=${activeProject.id}`),
        fetch(`${API_URL}/projects/${activeProject.id}/conflicts`),
      ]);

      if (
        !graphResponse.ok ||
        !decisionsResponse.ok ||
        !discussionsResponse.ok ||
        !candidatesResponse.ok ||
        !conflictsResponse.ok
      ) {
        throw new Error("Failed to load dashboard data");
      }

      const graphData = await graphResponse.json();
      const decisionsData = await decisionsResponse.json();
      const discussionsData = await discussionsResponse.json();
      const candidatesData = await candidatesResponse.json();
      const conflictsData = await conflictsResponse.json();

      setProject(activeProject);
      setGraph(graphData);
      setDecisions(decisionsData);
      setDecisionId((previous) =>
        decisionsData.some((item) => item.id === previous)
          ? previous
          : decisionsData[0]?.id ?? null
      );
      setDiscussions(discussionsData);
      setCandidates(candidatesData);
      setConflicts(conflictsData.conflicts);
      setRefreshTick((tick) => tick + 1);

      const trackedId =
        graphData.edges.length > 0
          ? graphData.edges[0].predecessor_commitment_id
          : graphData.nodes[0]?.id ?? null;

      const nodeIds = new Set(graphData.nodes.map((node) => node.id));

      setSelectedId(
        keepSelected != null && nodeIds.has(keepSelected)
          ? keepSelected
          : trackedId
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (selectedId == null) {
      setImpact(null);
      setHistory([]);
      return;
    }

    let cancelled = false;

    async function loadTrace() {
      try {
        const [impactResponse, historyResponse] = await Promise.all([
          fetch(`${API_URL}/commitments/${selectedId}/impact`),
          fetch(`${API_URL}/commitments/${selectedId}/history`),
        ]);

        if (!impactResponse.ok || !historyResponse.ok) {
          throw new Error("Failed to load traceability data");
        }

        if (!cancelled) {
          setImpact(await impactResponse.json());
          setHistory(await historyResponse.json());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      }
    }

    loadTrace();

    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshTick]);

  useEffect(() => {
    if (decisionId == null) {
      setDecisionHistory([]);
      setDecisionImpact(null);
      return;
    }

    let cancelled = false;

    async function loadDecisionTrace() {
      try {
        const [historyResponse, impactResponse] = await Promise.all([
          fetch(`${API_URL}/decisions/${decisionId}/history`),
          fetch(`${API_URL}/decisions/${decisionId}/impact`),
        ]);

        if (!historyResponse.ok || !impactResponse.ok) {
          throw new Error("Failed to load decision trace");
        }

        if (!cancelled) {
          setDecisionHistory(await historyResponse.json());
          setDecisionImpact(await impactResponse.json());
          setDecisionTraceError("");
        }
      } catch (err) {
        if (!cancelled) {
          setDecisionTraceError(err.message);
        }
      }
    }

    loadDecisionTrace();

    return () => {
      cancelled = true;
    };
  }, [decisionId, refreshTick]);

  function startDecisionEdit() {
    setDecisionDraft({
      title: decision.title,
      rationale: decision.rationale ?? "",
      status: decision.status,
      reason: "",
    });
    setDecisionError("");
    setEditingDecision(true);
  }

  async function saveDecision() {
    if (!decisionDraft.title?.trim()) {
      setDecisionError("Title cannot be empty");
      return;
    }

    // Send only the fields that actually changed. An empty rationale
    // must still be sent so clearing it works (null means "unchanged").
    const body = {};

    if (decisionDraft.title !== decision.title) {
      body.title = decisionDraft.title;
    }

    const draftRationale = decisionDraft.rationale ?? "";
    if (draftRationale !== (decision.rationale ?? "")) {
      body.rationale = draftRationale;
    }

    if (decisionDraft.status !== decision.status) {
      body.status = decisionDraft.status;
    }

    if (decisionDraft.reason?.trim()) {
      body.reason = decisionDraft.reason;
    }

    if (Object.keys(body).length === 0) {
      setDecisionError("No changes to save");
      return;
    }

    setUpdatingDecision(true);
    setDecisionError("");

    try {
      const response = await fetch(`${API_URL}/decisions/${decisionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to update decision");
      }

      setEditingDecision(false);

      await loadDashboard(selectedId);
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setUpdatingDecision(false);
    }
  }

  async function updateCommitmentStatus(commitmentId) {
    if (!newStatus) {
      return;
    }

    try {
      setUpdating(true);
      setEditorError("");

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

      await loadDashboard(commitmentId);
    } catch (err) {
      setEditorError(err.message);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return <div className="message">Loading DecisionTrace...</div>;
  }

  if (error) {
    return <div className="message error">Error: {error}</div>;
  }

  const byId = {};
  for (const node of graph.nodes) {
    byId[node.id] = node;
  }

  const decision =
    decisions.find((item) => item.id === decisionId) ??
    decisions[0] ??
    null;

  const analysisById = {};
  for (const item of graph.analysis) {
    analysisById[item.commitment_id] = item;
  }

  const orderedNodes = graph.topological_order
    .map((id) => byId[id])
    .filter(Boolean);

  // Only actual cycle members are "cyclic". Nodes omitted from the
  // topological order because they sit downstream of a cycle are
  // deferred, not cyclic.
  const cyclicNodeIds = new Set(graph.cycles.flat());

  const cyclicNodes = graph.nodes.filter(
    (node) => cyclicNodeIds.has(node.id)
  );

  const deferredNodes = graph.nodes.filter(
    (node) =>
      !graph.topological_order.includes(node.id) &&
      !cyclicNodeIds.has(node.id)
  );

  const selectedNode = selectedId != null ? byId[selectedId] : null;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="brand">DecisionTrace</div>
          <div className="brand-subtitle">
            Decision intelligence & traceability
          </div>
        </div>

        <div className="topbar-right">
          {conflicts.length > 0 && (
            <span className="topbar-conflicts">
              {conflicts.length}{" "}
              {conflicts.length === 1 ? "conflict" : "conflicts"}
            </span>
          )}

          <div className="project-label">
            {project?.name || "No project"}
          </div>
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

                <div className="decision-title-row">
                  <h2>{decision?.title || "No decision"}</h2>

                  {decisions.length > 1 && (
                    <select
                      className="decision-select"
                      value={decisionId ?? ""}
                      disabled={editingDecision}
                      onChange={(event) =>
                        setDecisionId(Number(event.target.value))
                      }
                    >
                      {decisions.map((item) => (
                        <option key={item.id} value={item.id}>
                          #{item.id} {item.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="decision-header-actions">
                {decision && <StatusBadge status={decision.status} />}

                {decision && !editingDecision && (
                  <button
                    className="secondary-button"
                    onClick={startDecisionEdit}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {editingDecision ? (
              <div className="decision-editor">
                <input
                  type="text"
                  placeholder="Title"
                  value={decisionDraft.title ?? ""}
                  onChange={(event) =>
                    setDecisionDraft({
                      ...decisionDraft,
                      title: event.target.value,
                    })
                  }
                />

                <textarea
                  rows={2}
                  placeholder="Rationale"
                  value={decisionDraft.rationale ?? ""}
                  onChange={(event) =>
                    setDecisionDraft({
                      ...decisionDraft,
                      rationale: event.target.value,
                    })
                  }
                />

                <select
                  value={decisionDraft.status ?? "CONFIRMED"}
                  onChange={(event) =>
                    setDecisionDraft({
                      ...decisionDraft,
                      status: event.target.value,
                    })
                  }
                >
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="SUPERSEDED">Superseded</option>
                  <option value="REVOKED">Revoked</option>
                </select>

                <input
                  type="text"
                  placeholder="Reason for this change"
                  value={decisionDraft.reason ?? ""}
                  onChange={(event) =>
                    setDecisionDraft({
                      ...decisionDraft,
                      reason: event.target.value,
                    })
                  }
                />

                <div className="editor-actions">
                  <button
                    className="primary-button"
                    disabled={
                      updatingDecision || !decisionDraft.title?.trim()
                    }
                    onClick={saveDecision}
                  >
                    {updatingDecision ? "Saving..." : "Save"}
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() => setEditingDecision(false)}
                  >
                    Cancel
                  </button>
                </div>

                {decisionError && (
                  <p className="pipeline-error">{decisionError}</p>
                )}
              </div>
            ) : (
              <>
                <div className="rationale">
                  <span>Rationale</span>
                  <p>{decision?.rationale || "No rationale recorded."}</p>
                </div>

                <div className="trace-source">
                  Source discussion #{decision?.source_discussion_id ?? "—"}
                </div>
              </>
            )}

            {decisionTraceError && (
              <p className="pipeline-error">
                Could not load decision trace: {decisionTraceError}
              </p>
            )}

            {decision && (
              <>
                <div className="decision-subsection">
                  <div className="decision-subheading">
                    <span>DECISION IMPACT</span>

                    {decisionImpact?.has_changes && (
                      <span className="change-warning">
                        changed {decisionImpact.change_count}× — linked
                        commitments may need review
                      </span>
                    )}
                  </div>

                  {decisionImpact &&
                  decisionImpact.affected_commitments.length > 0 ? (
                    decisionImpact.affected_commitments.map((item) => (
                      <div
                        className="linked-commitment"
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <strong>{item.owner}</strong>
                        <span>
                          #{item.id} · {item.status.replace("_", " ")}
                        </span>

                        {item.downstream.length > 0 ? (
                          <span className="downstream-note">
                            affects {names(item.downstream, byId)}
                          </span>
                        ) : (
                          <span className="downstream-note dim">
                            no downstream
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      No commitments linked to this decision yet.
                    </p>
                  )}
                </div>

                <div className="decision-subsection">
                  <div className="decision-subheading">
                    <span>CHANGE HISTORY</span>
                  </div>

                  {decisionHistory.length > 0 ? (
                    <div className="timeline">
                      {decisionHistory.map((item) => (
                        <div className="timeline-item" key={item.id}>
                          <div className="timeline-dot" />

                          <div>
                            <strong>
                              {item.old_title} → {item.new_title}
                            </strong>

                            {item.old_status !== item.new_status && (
                              <span className="history-status">
                                {item.old_status.replace("_", " ")}
                                {" → "}
                                {item.new_status.replace("_", " ")}
                              </span>
                            )}

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
                </div>
              </>
            )}
          </section>

          <section
            className={`card impact-card ${
              impact?.has_impact ? "impact-active" : ""
            }`}
          >
            <p className="eyebrow">IMPACT ANALYSIS</p>

            {impact ? (
              <>
                <h2>
                  {impact.has_impact
                    ? "Downstream impact detected"
                    : "No active impact"}
                </h2>

                <p className="muted source-note">
                  Source: {selectedNode?.owner || "?"} · Commitment #
                  {impact.commitment_id} ·{" "}
                  {impact.commitment_status.replace("_", " ")}
                </p>

                {impact.has_impact ? (
                  impact.affected_commitments.map((item) => (
                    <div className="impact-item" key={item.id}>
                      <strong>{item.owner}</strong>
                      <p>{item.description}</p>
                      <span className="impact-path">
                        {item.path
                          .map((id) => byId[id]?.owner ?? `#${id}`)
                          .join(" → ")}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    This commitment is not delayed or blocked, so nothing
                    downstream is currently at risk.
                  </p>
                )}
              </>
            ) : (
              <>
                <h2>Select a commitment</h2>
                <p className="muted">
                  Click a commitment below to analyze its downstream impact
                  and change history.
                </p>
              </>
            )}
          </section>
        </div>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">EXECUTION PLAN</p>
              <h2>Topological order</h2>
            </div>
          </div>

          {graph.has_cycles && (
            <div className="cycle-banner">
              <strong>Circular dependency detected</strong>
              <span>
                {graph.cycles
                  .map((cycle) =>
                    cycle.map((id) => byId[id]?.owner ?? `#${id}`).join(" → ")
                  )
                  .join("; ")}
              </span>
            </div>
          )}

          <div className="plan-list">
            {orderedNodes.map((node, index) => {
              const analysis = analysisById[node.id];
              const note = stateNote(analysis, byId);
              const risk = ["BLOCKED", "CYCLIC"].includes(analysis?.state);

              return (
                <div
                  className="plan-row"
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                >
                  <span className="plan-index">{index + 1}</span>

                  <div className="plan-owner">
                    <strong>{node.owner}</strong>
                    <span>Commitment #{node.id}</span>
                  </div>

                  <StatusBadge status={node.status} />

                  <span className={`plan-note ${risk ? "risk" : ""}`}>
                    {note}
                  </span>
                </div>
              );
            })}

            {cyclicNodes.map((node) => {
              const analysis = analysisById[node.id];

              return (
                <div
                  className="plan-row cyclic"
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                >
                  <span className="plan-index">↻</span>

                  <div className="plan-owner">
                    <strong>{node.owner}</strong>
                    <span>Commitment #{node.id}</span>
                  </div>

                  <StatusBadge status={node.status} />

                  <span className="plan-note risk">
                    {stateNote(analysis, byId)}
                  </span>
                </div>
              );
            })}

            {deferredNodes.map((node) => {
              const analysis = analysisById[node.id];

              return (
                <div
                  className="plan-row deferred"
                  key={node.id}
                  onClick={() => setSelectedId(node.id)}
                >
                  <span className="plan-index">—</span>

                  <div className="plan-owner">
                    <strong>{node.owner}</strong>
                    <span>Commitment #{node.id}</span>
                  </div>

                  <StatusBadge status={node.status} />

                  <span className="plan-note">
                    {stateNote(analysis, byId)} · blocked by a cycle
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONFLICT CHECK</p>
              <h2>Project consistency</h2>
            </div>
            <span>{conflicts.length} issues</span>
          </div>

          <div className="card conflict-card">
            {conflicts.length === 0 ? (
              <div className="conflicts-clean">
                <span className="clean-dot" />
                No conflicts detected — the project trace is consistent.
              </div>
            ) : (
              conflicts.map((conflict, index) => (
                <div className="conflict-row" key={index}>
                  <span
                    className={`severity-badge severity-${conflict.severity.toLowerCase()}`}
                  >
                    {conflict.severity}
                  </span>

                  <span className="conflict-type">
                    {conflict.type.replace("_", " ")}
                  </span>

                  <p>{conflict.message}</p>

                  <div className="conflict-refs">
                    {conflict.commitment_ids.map((id) => (
                      <button
                        className="ref-chip"
                        key={`commitment-${id}`}
                        onClick={() => setSelectedId(id)}
                      >
                        {byId[id]?.owner ?? "?"} #{id}
                      </button>
                    ))}

                    {conflict.decision_ids.map((id) => (
                      <button
                        className="ref-chip decision-chip"
                        key={`decision-${id}`}
                        onClick={() => setDecisionId(id)}
                      >
                        Decision #{id}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DEPENDENCY GRAPH</p>
              <h2>Work graph</h2>
            </div>
            <span>click a node to analyze it</span>
          </div>

          <div className="card">
            <GraphView
              graph={graph}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">EXECUTION</p>
              <h2>Commitments</h2>
            </div>
            <span>{graph.nodes.length} commitments</span>
          </div>

          <div className="commitment-grid">
            {graph.nodes.map((commitment) => (
              <article
                className={`card commitment-card ${
                  commitment.id === selectedId ? "selected" : ""
                }`}
                key={commitment.id}
                onClick={() => setSelectedId(commitment.id)}
              >
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

                    {editorError && (
                      <p className="pipeline-error">{editorError}</p>
                    )}

                    <div className="editor-actions">
                      <button
                        className="primary-button"
                        disabled={updating || !newStatus}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateCommitmentStatus(commitment.id);
                        }}
                      >
                        {updating ? "Updating..." : "Update Status"}
                      </button>

                      <button
                        className="secondary-button"
                        onClick={(event) => {
                          event.stopPropagation();
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
                    onClick={(event) => {
                      event.stopPropagation();
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

        <section className="section-block">
          <div className="section-heading">
            <div>
              <p className="eyebrow">AI-ASSISTED PIPELINE</p>
              <h2>Discussions & candidates</h2>
            </div>
            <span>AI proposes · humans decide</span>
          </div>

          <DiscussionsPanel
            discussions={discussions}
            projectId={project?.id}
            reload={loadDashboard}
          />

          <CandidatesPanel candidates={candidates} reload={loadDashboard} />
        </section>

        <div className="dashboard-grid lower-grid">
          <section className="card">
            <p className="eyebrow">DEPENDENCY TRACE</p>
            <h2>Work dependencies</h2>

            {graph.edges.map((dependency) => {
              const predecessor = byId[dependency.predecessor_commitment_id];
              const successor = byId[dependency.successor_commitment_id];

              return (
                <div className="dependency" key={dependency.id}>
                  <div className="dependency-node">
                    <strong>{predecessor?.owner || "Unknown"}</strong>
                    <span>
                      Commitment #{dependency.predecessor_commitment_id}
                    </span>
                  </div>

                  <div className="dependency-arrow">
                    <span>{dependency.dependency_type}</span>
                    <div>→</div>
                  </div>

                  <div className="dependency-node">
                    <strong>{successor?.owner || "Unknown"}</strong>
                    <span>
                      Commitment #{dependency.successor_commitment_id}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card">
            <p className="eyebrow">AUDIT TRAIL</p>
            <h2>Change history</h2>

            {selectedNode && (
              <p className="muted source-note">
                {selectedNode.owner} · Commitment #{selectedNode.id}
              </p>
            )}

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
