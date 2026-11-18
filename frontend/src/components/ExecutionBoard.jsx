import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { personColor } from "../personColors";
import StatusBadge from "./StatusBadge.jsx";

const API_URL = "http://127.0.0.1:8000";

// The classic plan-view layout: one column per topological depth.
const NODE_W = 170;
const NODE_H = 64;
const LAYER_GAP = 240;
const ROW_GAP = 100;
const PAD = 30;

const STATUS_COLORS = {
  COMPLETED: { fill: "#eaf8ef", stroke: "#267447", text: "#267447" },
  IN_PROGRESS: { fill: "#eef4ff", stroke: "#315ca8", text: "#315ca8" },
  OPEN: { fill: "#f2f4f7", stroke: "#475467", text: "#475467" },
  DELAYED: { fill: "#fff1f0", stroke: "#b42318", text: "#b42318" },
  BLOCKED: { fill: "#fff1f0", stroke: "#b42318", text: "#b42318" },
};

function computeLayout(graph) {
  const { tasks, edges } = graph;

  if (tasks.length === 0) {
    return null;
  }

  const predecessors = {};
  for (const edge of edges) {
    (predecessors[edge.successor_commitment_id] ??= []).push(
      edge.predecessor_commitment_id
    );
  }

  const layer = {};
  const order = tasks
    .filter((task) => task.position != null)
    .sort((a, b) => a.position - b.position)
    .map((task) => task.id);

  for (const id of order) {
    const predLayers = (predecessors[id] ?? [])
      .map((predId) => layer[predId])
      .filter((value) => value != null);

    layer[id] = predLayers.length ? Math.max(...predLayers) + 1 : 0;
  }

  const layers = {};
  for (const task of tasks) {
    (layers[layer[task.id]] ??= []).push(task);
  }

  const positions = {};
  let maxRows = 0;
  let maxColumn = 0;

  for (const column of Object.keys(layers)) {
    maxRows = Math.max(maxRows, layers[column].length);
    maxColumn = Math.max(maxColumn, Number(column));

    layers[column].forEach((task, index) => {
      positions[task.id] = {
        x: Number(column) * LAYER_GAP + PAD + NODE_W / 2,
        y: index * ROW_GAP + PAD + NODE_H / 2,
      };
    });
  }

  return {
    positions,
    svgWidth: maxColumn * LAYER_GAP + NODE_W + PAD * 2,
    svgHeight: (maxRows - 1) * ROW_GAP + NODE_H + PAD * 2,
  };
}

/**
 * The execution board of a chain — the classic plan-view look:
 * the dependency graph layered by execution order on top, the
 * numbered plan list with inline status editing below, and the AI
 * checks (cycles, blockers, ordering violations) in between.
 * Students operate it; the supervisor sees the same board read-only.
 */
export default function ExecutionBoard({ chainId, readOnly = false }) {
  const { t, te } = useI18n();

  const [execution, setExecution] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");

  async function reload() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/chains/${chainId}/execution`);

      if (!response.ok) {
        throw new Error(t("execution.loadFailed"));
      }

      setExecution(await response.json());
    } catch (err) {
      setError(te(err.message) || t("execution.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (chainId) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId]);

  async function addTask() {
    if (!owner.trim() || !description.trim()) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/chains/${chainId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: owner.trim(),
          description: description.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("execution.loadFailed"));
      }

      setOwner("");
      setDescription("");
      await reload();
    } catch (err) {
      setError(te(err.message) || t("execution.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(taskId) {
    if (!newStatus) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/commitments/${taskId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("execution.loadFailed"));
      }

      setEditingId(null);
      setNewStatus("");
      await reload();
    } catch (err) {
      setError(te(err.message) || t("execution.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function stateNote(task) {
    switch (task.state) {
      case "DONE":
        return t("status.DONE");
      case "READY":
        return t("status.READY");
      case "WAITING":
        return t("plan.waitingOn", { names: task.waiting_on.join(", ") });
      case "BLOCKED":
        return t("plan.blockedBy", { names: task.blocked_by.join(", ") });
      case "CYCLIC":
        return t("status.CYCLIC");
      default:
        return "";
    }
  }

  if (!execution) {
    return (
      <p className="muted" role="status">
        {t("common.loading")}
      </p>
    );
  }

  const layout = computeLayout(execution);
  const ordered = [...execution.tasks].sort((a, b) => {
    const pa = a.position ?? 999;
    const pb = b.position ?? 999;
    return pa - pb;
  });

  return (
    <div className="execution-board">
      {error && <p className="pipeline-error">{te(error)}</p>}

      <div className="decision-subsection">
        <div className="decision-subheading">
          <span>{t("execute.sectionTasks")}</span>
          <span className="subheading-note">
            {t("execution.taskCount", { count: execution.tasks.length })}
          </span>
        </div>

        {ordered.length === 0 ? (
          <p className="muted">{t("execution.none")}</p>
        ) : (
          <div className="plan-list">
            {ordered.map((task, index) => {
              const editing = editingId === task.id;

              return (
                <div className="plan-row" key={task.id}>
                  <span className="plan-index">{index + 1}</span>

                  <div className="plan-owner">
                    <strong>
                      <span
                        className="person-dot"
                        style={{ background: personColor(task.owner) }}
                        aria-hidden="true"
                      />{" "}
                      {task.owner}
                    </strong>
                    <span>{task.description}</span>
                  </div>

                  <StatusBadge status={task.status} />

                  <span
                    className={`plan-note ${
                      task.state === "BLOCKED" ? "risk" : ""
                    }`}
                  >
                    {stateNote(task)}
                  </span>

                  {!readOnly &&
                    (editing ? (
                      <div
                        className="status-editor"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <select
                          value={newStatus}
                          onChange={(event) =>
                            setNewStatus(event.target.value)
                          }
                        >
                          <option value="">{t("plan.selectStatus")}</option>
                          <option value="OPEN">{t("plan.statusOpen")}</option>
                          <option value="IN_PROGRESS">
                            {t("plan.statusInProgress")}
                          </option>
                          <option value="DELAYED">
                            {t("plan.statusDelayed")}
                          </option>
                          <option value="BLOCKED">
                            {t("plan.statusBlocked")}
                          </option>
                          <option value="COMPLETED">
                            {t("plan.statusCompleted")}
                          </option>
                        </select>

                        <div className="editor-actions">
                          <button
                            className="primary-button"
                            disabled={busy || !newStatus}
                            onClick={(event) => {
                              event.stopPropagation();
                              updateStatus(task.id);
                            }}
                          >
                            {busy
                              ? t("common.updating")
                              : t("plan.updateStatus")}
                          </button>

                          <button
                            className="secondary-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingId(null);
                              setNewStatus("");
                            }}
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="change-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingId(task.id);
                          setNewStatus("");
                        }}
                      >
                        {t("plan.changeStatus")}
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        )}

        {!readOnly && (
          <div className="execution-add">
            <input
              type="text"
              placeholder={t("execution.ownerPlaceholder")}
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            />

            <input
              type="text"
              placeholder={t("execution.descriptionPlaceholder")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />

            <button
              type="button"
              className="primary-button"
              disabled={busy || !owner.trim() || !description.trim()}
              onClick={addTask}
            >
              {t("execution.add")}
            </button>
          </div>
        )}
      </div>

      <div className="decision-subsection">
        <div className="decision-subheading">
          <span>{t("execute.sectionGraph")}</span>
        </div>

        {layout && (
        <div className="graph-wrap">
          <svg
            className="graph-svg"
            viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
            width={layout.svgWidth}
            height={layout.svgHeight}
            role="img"
            aria-label={t("dependencies.graphAria")}
          >
            <defs>
              <marker
                id="exec-arrow"
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

            {execution.edges.map((edge) => {
              const from = layout.positions[edge.predecessor_commitment_id];
              const to = layout.positions[edge.successor_commitment_id];

              if (!from || !to) {
                return null;
              }

              return (
                <line
                  key={`${edge.predecessor_commitment_id}-${edge.successor_commitment_id}`}
                  x1={from.x + NODE_W / 2}
                  y1={from.y}
                  x2={to.x - NODE_W / 2}
                  y2={to.y}
                  stroke="#98a2b3"
                  strokeWidth={1.5}
                  markerEnd="url(#exec-arrow)"
                />
              );
            })}

            {execution.tasks.map((task) => {
              const pos = layout.positions[task.id];

              if (!pos) {
                return null;
              }

              const colors =
                STATUS_COLORS[task.status] ?? STATUS_COLORS.OPEN;

              return (
                <g className="graph-node" key={task.id}>
                  <rect
                    x={pos.x - NODE_W / 2}
                    y={pos.y - NODE_H / 2}
                    width={NODE_W}
                    height={NODE_H}
                    rx={12}
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth={1.5}
                  />
                  <text
                    x={pos.x - NODE_W / 2 + 14}
                    y={pos.y - 5}
                    fontSize={13}
                    fontWeight={700}
                    fill="#172033"
                  >
                    {task.owner}
                  </text>
                  <text
                    x={pos.x - NODE_W / 2 + 14}
                    y={pos.y + 15}
                    fontSize={11.5}
                    fill={colors.text}
                  >
                    #{task.id} ·{" "}
                    {t(
                      `status.${task.status}`,
                      {},
                      task.status.replace("_", " ")
                    )}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        )}
      </div>

      <div className="decision-subsection">
        <div className="decision-subheading">
          <span>{t("execute.sectionProblems")}</span>
        </div>

        {execution.checks.length === 0 ? (
          <p className="muted">{t("execution.noProblems")}</p>
        ) : (
          <div className="execution-checks">
          {execution.checks.map((check, index) => (
            <p className="execution-check" key={index}>
              <span className="execution-check-type">
                {t(`execution.check.${check.type}`, {}, check.type)}
              </span>
              {check.message}
            </p>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

