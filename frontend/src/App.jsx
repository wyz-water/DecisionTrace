import { useEffect, useState } from "react";
import "./App.css";
import DiscussionsPanel from "./components/DiscussionsPanel.jsx";
import CandidatesPanel from "./components/CandidatesPanel.jsx";
import CycleDialog from "./components/CycleDialog.jsx";
import ImpactPanel from "./components/ImpactPanel.jsx";
import LanguageToggle from "./components/LanguageToggle.jsx";
import Pagination from "./components/Pagination.jsx";
import ProjectSwitcher from "./components/ProjectSwitcher.jsx";
import SearchPanel from "./components/SearchPanel.jsx";
import Sidebar from "./components/Sidebar.jsx";
import SnapshotDiff from "./components/SnapshotDiff.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
import { useI18n } from "./i18n";
import usePagedList from "./usePagedList.js";
import { readView } from "./views.js";

const API_URL = "http://127.0.0.1:8000";

// Page sizes are chosen per surface, not globally: the candidate grid is
// two columns, so 4 fills exactly two rows; the audit timeline is taller,
// so 4 entries is already a full card.
const DISCUSSIONS_PAGE_SIZE = 3;
const CANDIDATES_PAGE_SIZE = 4;
const AUDIT_PAGE_SIZE = 4;

const STATUS_COLORS = {
  COMPLETED: { fill: "#eaf8ef", stroke: "#267447", text: "#267447" },
  IN_PROGRESS: { fill: "#eef4ff", stroke: "#315ca8", text: "#315ca8" },
  OPEN: { fill: "#f2f4f7", stroke: "#475467", text: "#475467" },
  DELAYED: { fill: "#fff1f0", stroke: "#b42318", text: "#b42318" },
  BLOCKED: { fill: "#fff1f0", stroke: "#b42318", text: "#b42318" },
};

function names(ids, byId) {
  return ids.map((id) => byId[id]?.owner ?? `#${id}`).join(", ");
}

function stateNote(analysis, byId, t) {
  switch (analysis.state) {
    case "DONE":
      return t("status.DONE");
    case "READY":
      return t("status.READY");
    case "WAITING":
      return t("plan.waitingOn", { names: names(analysis.waiting_on, byId) });
    case "BLOCKED":
      return t("plan.blockedBy", { names: names(analysis.blocked_by, byId) });
    case "CYCLIC":
      return t("status.CYCLIC");
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

/**
 * Place the graph in columns, one column per topological depth.
 *
 * Returns null when a node has no depth, which happens exactly when the
 * node sits on a cycle: a loop has no topological order, so there is no
 * left-to-right arrangement that could be drawn honestly. The caller
 * renders the "cannot be ordered" notice instead of a partial graph.
 */
function computeLayout(graph) {
  const { nodes, edges, topological_order: topo } = graph;

  if (nodes.length === 0) {
    return null;
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

  // A node without a depth sits on a cycle; there is no order to draw.
  if (nodes.some((node) => !(node.id in layer))) {
    return null;
  }

  const layers = {};
  for (const node of nodes) {
    (layers[layer[node.id]] ??= []).push(node);
  }

  const positions = {};
  let maxRows = 0;
  let maxColumn = 0;

  for (const column of Object.keys(layers)) {
    maxRows = Math.max(maxRows, layers[column].length);
    maxColumn = Math.max(maxColumn, Number(column));

    layers[column].forEach((node, index) => {
      positions[node.id] = {
        x: Number(column) * LAYER_GAP + PAD + NODE_W / 2,
        y: index * ROW_GAP + PAD + NODE_H / 2,
      };
    });
  }

  return {
    positions,
    // Sized from the widest column that actually holds a node, not from
    // the number of columns: sparse layer numbers used to under-size the
    // viewBox and crop the graph.
    svgWidth: maxColumn * LAYER_GAP + NODE_W + PAD * 2,
    svgHeight: (maxRows - 1) * ROW_GAP + NODE_H + PAD * 2,
  };
}

function CycleNotice({ graph }) {
  const { t } = useI18n();
  const owners = {};
  for (const node of graph.nodes) {
    owners[node.id] = node.owner;
  }

  return (
    <div className="graph-blocked" role="alert">
      <span className="graph-blocked-badge">
        {t("consistency.type.CYCLE")}
      </span>

      <div className="graph-blocked-body">
        <p className="graph-blocked-title">
          {t("plan.cycleNoticeTitle")}
        </p>

        <p>{t("plan.cycleNoticeBody")}</p>

        <ul className="graph-blocked-loops">
          {graph.cycles.map((cycle) => (
            <li key={cycle.join("-")}>
              {cycle.map((id) => owners[id] ?? `#${id}`).join(" → ")}
            </li>
          ))}
        </ul>

        <p className="graph-blocked-hint">{t("plan.cycleNoticeHint")}</p>
      </div>
    </div>
  );
}

function GraphView({ graph, selectedId, onSelect, highlightIds = [] }) {
  const { t } = useI18n();

  // A cycle has no topological order, so there is nothing honest to draw.
  if (graph.has_cycles) {
    return <CycleNotice graph={graph} />;
  }

  const layout = computeLayout(graph);

  if (!layout) {
    return <p className="muted">{t("plan.noCommitments")}</p>;
  }

  const { positions, svgWidth, svgHeight } = layout;

  return (
    <div className="graph-wrap">
      <svg
        className="graph-svg"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width={svgWidth}
        height={svgHeight}
        role="img"
        aria-label={t("dependencies.graphAria")}
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

          // Without cycles every edge runs one column to the right, so a
          // straight line is the honest shape.
          return (
            <path
              className="graph-edge"
              key={edge.id}
              d={`M ${from.x + NODE_W / 2} ${from.y} L ${to.x - NODE_W / 2} ${to.y}`}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {graph.nodes.map((node) => {
          const pos = positions[node.id];

          if (!pos) {
            return null;
          }

          const colors = STATUS_COLORS[node.status] ?? STATUS_COLORS.OPEN;
          const selected = node.id === selectedId;
          const affected = highlightIds.includes(node.id);

          return (
            <g
              className={`graph-node ${selected ? "selected" : ""} ${
                affected ? "affected" : ""
              }`}
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
                stroke={
                  selected
                    ? "#172033"
                    : affected
                      ? "#b54708"
                      : colors.stroke
                }
                strokeWidth={selected || affected ? 2.5 : 1.5}
                strokeDasharray={affected && !selected ? "5 3" : undefined}
              />
              <text
                x={pos.x - NODE_W / 2 + 14}
                y={pos.y - 5}
                fontSize={13}
                fontWeight={700}
                fill="#172033"
              >
                {node.owner}
              </text>
              <text
                x={pos.x - NODE_W / 2 + 14}
                y={pos.y + 15}
                fontSize={11.5}
                fill={colors.text}
              >
                #{node.id} ·{" "}
                {t(
                  `status.${node.status}`,
                  {},
                  node.status.replace("_", " ")
                )}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- Section header ----------------------------------------------------------

function ViewHeader({ eyebrow, title, children }) {
  return (
    <header className="view-header">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{children}</p>
    </header>
  );
}

// --- App ---------------------------------------------------------------------

function App() {
  const { t, tp, te, formatDate, formatDateTime } = useI18n();
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [decisionId, setDecisionId] = useState(null);
  const [decisionImpact, setDecisionImpact] = useState(null);
  const [graph, setGraph] = useState({
    nodes: [],
    edges: [],
    topological_order: [],
    cycles: [],
    has_cycles: false,
    analysis: [],
  });
  const [impact, setImpact] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [whatIfStatus, setWhatIfStatus] = useState("DELAYED");
  const [whatIf, setWhatIf] = useState(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [whatIfError, setWhatIfError] = useState("");
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

  // New-dependency form. The server refuses an edge that would close a
  // cycle and answers 409 with the loop; that payload opens the dialog.
  const [dependencyDraft, setDependencyDraft] = useState({
    predecessor: "",
    successor: "",
  });
  const [dependencySaving, setDependencySaving] = useState(false);
  const [dependencyError, setDependencyError] = useState("");
  // Advisory, not a rejection: the edge is stored and the dates are wrong.
  const [dependencyNotice, setDependencyNotice] = useState(null);
  const [cycleReport, setCycleReport] = useState(null);
  const [cycleError, setCycleError] = useState("");

  // Bumped after every mutation so the paginated lists and the impact
  // cards re-fetch without losing the page the user is standing on.
  const [refreshTick, setRefreshTick] = useState(0);

  // Graph snapshots: saved copies of the dependency graph with a title
  // and timestamp ("meeting summary as a graph").
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotTitle, setSnapshotTitle] = useState("");
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotError, setSnapshotError] = useState("");
  const [snapshotNotice, setSnapshotNotice] = useState("");
  const [viewingSnapshot, setViewingSnapshot] = useState(null);
  const [viewingSnapshotLoading, setViewingSnapshotLoading] = useState(false);
  const [viewingSnapshotError, setViewingSnapshotError] = useState("");

  // Snapshot comparison: the two selected ids, the server-computed diff,
  // and the loading/error states that keep the result from going stale.
  const [compareFromId, setCompareFromId] = useState("");
  const [compareToId, setCompareToId] = useState("");
  const [snapshotDiff, setSnapshotDiff] = useState(null);
  const [snapshotDiffLoading, setSnapshotDiffLoading] = useState(false);
  const [snapshotDiffError, setSnapshotDiffError] = useState("");

  // Which section is on screen. Driven by the URL hash so a reload, a
  // bookmark and the back button all land on the same section.
  const [view, setView] = useState(() => readView(window.location.hash));

  const projectId = project?.id ?? null;

  const discussions = usePagedList(
    projectId ? `${API_URL}/discussions?project_id=${projectId}` : null,
    DISCUSSIONS_PAGE_SIZE,
    refreshTick
  );

  // Two independent queues: confirming a candidate moves it from the
  // first to the second, so paging one must not page the other.
  const pendingCandidates = usePagedList(
    projectId
      ? `${API_URL}/candidates?project_id=${projectId}&status=PENDING`
      : null,
    CANDIDATES_PAGE_SIZE,
    refreshTick
  );

  const reviewedCandidates = usePagedList(
    projectId
      ? `${API_URL}/candidates?project_id=${projectId}&status=CONFIRMED,REJECTED`
      : null,
    CANDIDATES_PAGE_SIZE,
    refreshTick
  );

  const commitmentHistory = usePagedList(
    selectedId != null
      ? `${API_URL}/commitments/${selectedId}/history`
      : null,
    AUDIT_PAGE_SIZE,
    refreshTick
  );

  const decisionHistory = usePagedList(
    decisionId != null
      ? `${API_URL}/decisions/${decisionId}/history`
      : null,
    AUDIT_PAGE_SIZE,
    refreshTick
  );

  // The impact cards keep the last response they fetched and only render
  // it while it still belongs to the current selection. Comparing against
  // the payload's own id means a stale card can never be shown, without
  // an effect having to clear state just to hide it.
  const currentImpact =
    impact && impact.commitment_id === selectedId ? impact : null;

  const currentWhatIf =
    whatIfOpen &&
    whatIf?.commitment_id === selectedId &&
    whatIf?.hypothetical_status === whatIfStatus
      ? whatIf
      : null;

  // Remount the impact panel when the source, hypothesis, or mode changes
  // so its internal list pagination always starts on page one.
  const impactPanelKey = `impact-${selectedId ?? "none"}-${whatIfStatus}-${
    whatIfOpen ? "preview" : "current"
  }`;

  const currentDecisionImpact =
    decisionImpact && decisionImpact.decision_id === decisionId
      ? decisionImpact
      : null;

  async function loadDashboard(keepSelected = null, preferProjectId = null) {
    try {
      const projectsResponse = await fetch(`${API_URL}/projects`);

      if (!projectsResponse.ok) {
        throw new Error("Failed to load projects");
      }

      const projects = await projectsResponse.json();

      // Cleared only after an await: setting state synchronously inside
      // the effect body triggers a cascading render
      // (react-hooks/set-state-in-effect).
      setError("");
      setProjects(projects);

      if (projects.length === 0) {
        setError(t("app.noProjects"));
        return;
      }

      const savedId = Number(
        window.localStorage.getItem("decisiontrace.activeProjectId")
      );

      // Selection order: an explicit switch target, then the last project
      // the user picked (persisted), then the first. Every path that
      // changes the active project writes localStorage first, so the
      // loader never needs to read component state.
      const activeProject =
        projects.find((item) => item.id === preferProjectId) ??
        projects.find((item) => item.id === savedId) ??
        projects[0];

      const [graphResponse, decisionsResponse, conflictsResponse] =
        await Promise.all([
          fetch(`${API_URL}/projects/${activeProject.id}/graph`),
          fetch(`${API_URL}/decisions?project_id=${activeProject.id}`),
          fetch(`${API_URL}/projects/${activeProject.id}/conflicts`),
        ]);

      if (
        !graphResponse.ok ||
        !decisionsResponse.ok ||
        !conflictsResponse.ok
      ) {
        throw new Error("Failed to load dashboard data");
      }

      const graphData = await graphResponse.json();
      const decisionsData = await decisionsResponse.json();
      const conflictsData = await conflictsResponse.json();

      setProject(activeProject);
      setGraph(graphData);
      setDecisions(decisionsData);
      setDecisionId((previous) =>
        decisionsData.some((item) => item.id === previous)
          ? previous
          : decisionsData[0]?.id ?? null
      );
      setConflicts(conflictsData.conflicts);

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
      setError(te(err.message));
    } finally {
      setLoading(false);
    }
  }

  // Reload everything after a write. `loadDashboard` alone would leave
  // the paginated lists and the impact cards showing pre-write data.
  async function reloadData(keepSelected = null) {
    await loadDashboard(keepSelected);
    setRefreshTick((tick) => tick + 1);
  }

  function openImpact(commitmentId, status = "DELAYED") {
    setSelectedId(commitmentId);
    setWhatIfStatus(status);
    setWhatIfError("");
    setWhatIfOpen(true);

    // The Plan page renders the preview below the commitment grid. Bring
    // it into view after the click so the preview is genuinely one click
    // away instead of one click plus a manual scroll.
    if (view === "plan") {
      window.setTimeout(() => {
        document
          .getElementById("impact-panel")
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 0);
    }
  }

  function previewImpact(status = whatIfStatus) {
    if (selectedId == null) {
      return;
    }

    setWhatIfStatus(status);
    setWhatIfError("");
    setWhatIfOpen(true);
  }

  function closeImpact() {
    setWhatIfOpen(false);
    setWhatIfError("");
  }

  function selectProject(nextProject) {
    closeImpact();
    window.localStorage.setItem(
      "decisiontrace.activeProjectId",
      String(nextProject.id)
    );
    setProject(nextProject);
    loadDashboard(null, nextProject.id);
  }

  async function createProject(name, description) {
    const response = await fetch(`${API_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "Failed to create project");
    }

    const created = await response.json();

    closeImpact();
    window.localStorage.setItem(
      "decisiontrace.activeProjectId",
      String(created.id)
    );
    setProject(created);
    await loadDashboard(null, created.id);
  }

  async function deleteProject(targetProject) {
    const response = await fetch(`${API_URL}/projects/${targetProject.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "Failed to delete project");
    }

    // Dropping the active project must not leave its id behind as the
    // "last picked" project, or the loader would try to resurrect it.
    if (project?.id === targetProject.id) {
      closeImpact();
      window.localStorage.removeItem("decisiontrace.activeProjectId");
      setProject(null);
      await loadDashboard();
    } else {
      await loadDashboard(null, project?.id ?? null);
    }
  }

  async function loadSnapshots() {
    if (!project?.id) {
      setSnapshots([]);
      setViewingSnapshot(null);
      setViewingSnapshotError("");
      setSnapshotDiff(null);
      setSnapshotDiffError("");
      setCompareFromId("");
      setCompareToId("");
      return;
    }

    try {
      setViewingSnapshot(null);
      setViewingSnapshotError("");

      const response = await fetch(
        `${API_URL}/projects/${project.id}/snapshots?limit=20`
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const items = data.items ?? [];

      setSnapshots(items);
      setSnapshotDiff(null);
      setSnapshotDiffError("");

      // Default to "previous vs latest": older on the left, newer on the
      // right. Keep an explicit choice while it still exists in the list.
      setCompareFromId((current) =>
        items.some((item) => String(item.id) === String(current))
          ? current
          : items[1]?.id ?? items[0]?.id ?? ""
      );
      setCompareToId((current) =>
        items.some((item) => String(item.id) === String(current))
          ? current
          : items[0]?.id ?? ""
      );

      if (items.length < 2) {
        setSnapshotDiff(null);
      }
    } catch {
      // A failed list refresh keeps the previous list on screen.
    }
  }

  async function fetchSnapshotDetail(snapshotId) {
    const response = await fetch(
      `${API_URL}/projects/${project.id}/snapshots/${snapshotId}`
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.detail || "Failed to load the snapshot.");
    }

    return response.json();
  }

  async function viewSnapshot(snapshot) {
    if (!project?.id) {
      return;
    }

    setViewingSnapshot(null);
    setViewingSnapshotLoading(true);
    setViewingSnapshotError("");

    try {
      setViewingSnapshot(await fetchSnapshotDetail(snapshot.id));
    } catch (err) {
      setViewingSnapshotError(
        te(err.message) || t("dependencies.failedLoadSnapshot")
      );
    } finally {
      setViewingSnapshotLoading(false);
    }
  }

  async function runSnapshotDiff(fromId, toId) {
    if (!project?.id || !fromId || !toId) {
      return;
    }

    if (String(fromId) === String(toId)) {
      setSnapshotDiff(null);
      setSnapshotDiffError(t("dependencies.compareSame"));
      return;
    }

    setSnapshotDiff(null);
    setSnapshotDiffError("");
    setSnapshotDiffLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/projects/${project.id}/snapshots/${fromId}/diff/${toId}`
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to compare snapshots.");
      }

      setSnapshotDiff(await response.json());
    } catch (err) {
      setSnapshotDiffError(
        te(err.message) || t("dependencies.compareFailed")
      );
    } finally {
      setSnapshotDiffLoading(false);
    }
  }

  async function compareSnapshots(event) {
    event.preventDefault();
    await runSnapshotDiff(compareFromId, compareToId);
  }

  function compareWithPrevious(index) {
    const current = snapshots[index];
    const previous = snapshots[index + 1];

    if (!current || !previous) {
      return;
    }

    setCompareFromId(previous.id);
    setCompareToId(current.id);
    runSnapshotDiff(previous.id, current.id);
  }

  async function saveSnapshot(event) {
    event.preventDefault();

    const title = snapshotTitle.trim();

    if (!title || !project?.id) {
      return;
    }

    setSnapshotSaving(true);
    setSnapshotError("");
    setSnapshotNotice("");

    try {
      const response = await fetch(
        `${API_URL}/projects/${project.id}/snapshots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to save the snapshot.");
      }

      const snapshot = await response.json();

      downloadGraphSvg(snapshot.graph, title);
      setSnapshotTitle("");

      const nodes = snapshot.graph?.nodes?.length ?? 0;
      const edges = snapshot.graph?.edges?.length ?? 0;

      setSnapshotNotice(
        t("dependencies.snapshotSaved", {
          nodes,
          nodeWord: tp("dependencies.snapshotCommitments", nodes, {
            count: nodes,
          }),
          edges,
          edgeWord: tp("dependencies.snapshotDependencies", edges, {
            count: edges,
          }),
        })
      );

      await loadSnapshots();
    } catch (err) {
      setSnapshotError(te(err.message) || t("dependencies.failedSnapshot"));
    } finally {
      setSnapshotSaving(false);
    }
  }

  function buildGraphSvg(graph, title) {
    const layout = computeLayout(graph);

    if (!layout) {
      return null;
    }

    const { positions, svgWidth, svgHeight } = layout;
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");

    svg.setAttribute("xmlns", svgNs);
    svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
    svg.setAttribute("width", svgWidth);
    svg.setAttribute("height", svgHeight);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", title);

    const titleNode = document.createElementNS(svgNs, "title");
    titleNode.textContent = title;
    svg.appendChild(titleNode);

    const background = document.createElementNS(svgNs, "rect");
    background.setAttribute("width", svgWidth);
    background.setAttribute("height", svgHeight);
    background.setAttribute("fill", "#ffffff");
    svg.appendChild(background);

    const defs = document.createElementNS(svgNs, "defs");
    const marker = document.createElementNS(svgNs, "marker");
    marker.setAttribute("id", "snapshot-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto-start-reverse");

    const arrow = document.createElementNS(svgNs, "path");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrow.setAttribute("fill", "#98a2b3");
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);

    for (const edge of graph.edges) {
      const from = positions[edge.predecessor_commitment_id];
      const to = positions[edge.successor_commitment_id];

      if (!from || !to) {
        continue;
      }

      const path = document.createElementNS(svgNs, "path");
      path.setAttribute(
        "d",
        `M ${from.x + NODE_W / 2} ${from.y} L ${to.x - NODE_W / 2} ${to.y}`
      );
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#98a2b3");
      path.setAttribute("stroke-width", "1.6");
      path.setAttribute("marker-end", "url(#snapshot-arrow)");
      svg.appendChild(path);
    }

    for (const node of graph.nodes) {
      const pos = positions[node.id];

      if (!pos) {
        continue;
      }

      const colors = STATUS_COLORS[node.status] ?? STATUS_COLORS.OPEN;
      const rect = document.createElementNS(svgNs, "rect");
      rect.setAttribute("x", pos.x - NODE_W / 2);
      rect.setAttribute("y", pos.y - NODE_H / 2);
      rect.setAttribute("width", NODE_W);
      rect.setAttribute("height", NODE_H);
      rect.setAttribute("rx", "12");
      rect.setAttribute("fill", colors.fill);
      rect.setAttribute("stroke", colors.stroke);
      rect.setAttribute("stroke-width", "1.5");
      svg.appendChild(rect);

      const owner = document.createElementNS(svgNs, "text");
      owner.setAttribute("x", pos.x - NODE_W / 2 + 14);
      owner.setAttribute("y", pos.y - 5);
      owner.setAttribute("font-family", '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif');
      owner.setAttribute("font-size", "13");
      owner.setAttribute("font-weight", "700");
      owner.setAttribute("fill", "#172033");
      owner.textContent = node.owner;
      svg.appendChild(owner);

      const status = document.createElementNS(svgNs, "text");
      status.setAttribute("x", pos.x - NODE_W / 2 + 14);
      status.setAttribute("y", pos.y + 15);
      status.setAttribute("font-family", '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif');
      status.setAttribute("font-size", "11.5");
      status.setAttribute("fill", colors.text);
      status.textContent = `#${node.id} · ${t(
        `status.${node.status}`,
        {},
        node.status.replace("_", " ")
      )}`;
      svg.appendChild(status);
    }

    return svg;
  }

  function downloadGraphSvg(graph, title) {
    const svg = buildGraphSvg(graph, title);

    if (!svg) {
      return;
    }

    // Serialize a detached SVG built from the saved graph, not the SVG
    // currently on screen: saving while viewing an older snapshot must
    // download the graph that was just saved.
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      `${title.replace(/[^\w一-鿿]+/g, "-").toLowerCase() || "snapshot"}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadSnapshotJson(snapshot) {
    if (!project?.id) {
      return;
    }

    try {
      const detail = await fetchSnapshotDetail(snapshot.id);
      const blob = new Blob([JSON.stringify(detail.graph, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        `${snapshot.title.replace(/[^\w一-鿿]+/g, "-").toLowerCase() || "snapshot"}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSnapshotError(
        te(err.message) || t("dependencies.failedLoadSnapshot")
      );
    }
  }

  async function deleteSnapshot(snapshotId) {
    if (!project?.id) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/projects/${project.id}/snapshots/${snapshotId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete the snapshot.");
      }

      if (viewingSnapshot?.id === snapshotId) {
        setViewingSnapshot(null);
      }

      setSnapshotDiff(null);
      await loadSnapshots();
    } catch (err) {
      setSnapshotError(
        te(err.message) || t("dependencies.failedDeleteSnapshot")
      );
    }
  }

  function formatSnapshotTime(value) {
    return formatDateTime(value);
  }

  useEffect(() => {
    // Same deferred-loader pattern as the dashboard effect above.
    async function load() {
      await loadSnapshots();
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    // Defined locally and awaited: react-hooks' set-state-in-effect rule
    // flags a bare call to a state-updating loader from the effect body,
    // even though loadDashboard() only touches state after its first
    // await. Keeping the call inside a local async function makes the
    // deferral explicit to both the rule and the reader.
    async function load() {
      await loadDashboard();
    }

    load();
    // The loader is intentionally called once on mount; adding it to the
    // dependency list would re-run the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleHashChange() {
      setView(readView(window.location.hash));

      // A section swap is a page change: land at the top, not halfway
      // down a section the user has not seen yet.
      window.scrollTo(0, 0);
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // Cross-section links (a conflict chip that should open the audit
  // trail, for example) go through the hash so the sidebar state, the
  // URL and the back button stay in agreement.
  function navigate(nextView) {
    if (nextView === view) {
      return;
    }

    window.location.hash = nextView;
  }

  useEffect(() => {
    if (selectedId == null) {
      return undefined;
    }

    let cancelled = false;

    async function loadTrace() {
      setImpactLoading(true);

      try {
        const impactResponse = await fetch(
          `${API_URL}/commitments/${selectedId}/impact`
        );

        if (!impactResponse.ok) {
          throw new Error("Failed to load traceability data");
        }

        if (!cancelled) {
          setImpact(await impactResponse.json());
        }
      } catch (err) {
        if (!cancelled) {
          setError(te(err.message));
        }
      } finally {
        if (!cancelled) {
          setImpactLoading(false);
        }
      }
    }

    loadTrace();

    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshTick, te]);

  useEffect(() => {
    if (!whatIfOpen || selectedId == null) {
      return undefined;
    }

    let cancelled = false;

    async function loadWhatIf() {
      setWhatIfLoading(true);
      setWhatIfError("");

      try {
        const response = await fetch(
          `${API_URL}/commitments/${selectedId}/what-if?status=${whatIfStatus}`
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || "Failed to preview impact.");
        }

        if (!cancelled) {
          setWhatIf(await response.json());
        }
      } catch (err) {
        if (!cancelled) {
          setWhatIfError(
            te(err.message) || t("impact.failedPreview")
          );
        }
      } finally {
        if (!cancelled) {
          setWhatIfLoading(false);
        }
      }
    }

    loadWhatIf();

    return () => {
      cancelled = true;
    };
  }, [whatIfOpen, selectedId, whatIfStatus, refreshTick, te, t]);

  useEffect(() => {
    if (decisionId == null) {
      return undefined;
    }

    let cancelled = false;

    async function loadDecisionTrace() {
      try {
        const impactResponse = await fetch(
          `${API_URL}/decisions/${decisionId}/impact`
        );

        if (!impactResponse.ok) {
          throw new Error("Failed to load decision trace");
        }

        if (!cancelled) {
          setDecisionImpact(await impactResponse.json());
          setDecisionTraceError("");
        }
      } catch (err) {
        if (!cancelled) {
          setDecisionTraceError(te(err.message));
        }
      }
    }

    loadDecisionTrace();

    return () => {
      cancelled = true;
    };
  }, [decisionId, refreshTick, te]);

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
      setDecisionError(t("decisions.titleRequired"));
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
      setDecisionError(t("decisions.noChanges"));
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

      await reloadData(selectedId);
    } catch (err) {
      setDecisionError(te(err.message) || t("decisions.failedUpdate"));
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

      await reloadData(commitmentId);
    } catch (err) {
      setEditorError(te(err.message) || t("plan.failedStatus"));
    } finally {
      setUpdating(false);
    }
  }

  async function addDependency(event) {
    event.preventDefault();

    if (!project) {
      return;
    }

    if (!dependencyDraft.predecessor || !dependencyDraft.successor) {
      setDependencyError(t("dependencies.pickBoth"));
      return;
    }

    try {
      setDependencySaving(true);
      setDependencyError("");
      setDependencyNotice(null);

      const response = await fetch(`${API_URL}/dependencies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: project.id,
          predecessor_commitment_id: Number(dependencyDraft.predecessor),
          successor_commitment_id: Number(dependencyDraft.successor),
          dependency_type: "BLOCKS",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        const detail = data.detail;

        // 409 + CYCLE_DETECTED carries the loop; anything else is a
        // plain message shown under the form.
        if (detail && detail.code === "CYCLE_DETECTED") {
          setCycleError("");
          setCycleReport(detail);
          return;
        }

        if (detail && detail.code === "DUPLICATE_DEPENDENCY") {
          const predecessor = graph.nodes.find(
            (node) => node.id === Number(dependencyDraft.predecessor)
          );
          const successor = graph.nodes.find(
            (node) => node.id === Number(dependencyDraft.successor)
          );

          setDependencyError(
            t("dependencies.duplicate", {
              from: predecessor?.owner ?? "?",
              to: successor?.owner ?? "?",
            })
          );
          return;
        }

        throw new Error(
          typeof detail === "string"
            ? detail
            : detail?.message || "Failed to add the dependency"
        );
      }

      const created = await response.json();

      setDependencyDraft({ predecessor: "", successor: "" });
      setDependencyNotice(
        created.warning
          ? { ...created.warning, dependency_id: created.id }
          : null
      );
      await reloadData(selectedId);
    } catch (err) {
      setDependencyError(te(err.message) || t("dependencies.failedAdd"));
    } finally {
      setDependencySaving(false);
    }
  }

  async function removeDependency(dependencyId) {
    try {
      setDependencySaving(true);
      setDependencyError("");
      setCycleError("");

      const response = await fetch(
        `${API_URL}/dependencies/${dependencyId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Failed to remove the dependency"
        );
      }

      setCycleReport(null);
      setDependencyNotice(null);
      await reloadData(selectedId);
    } catch (err) {
      if (cycleReport) {
        setCycleError(te(err.message));
      } else {
        setDependencyError(te(err.message) || t("dependencies.failedRemove"));
      }
    } finally {
      setDependencySaving(false);
    }
  }

  async function markCycleTaskBlocked() {
    if (!cycleReport) {
      return;
    }

    const target = cycleReport.recommendation;

    try {
      setDependencySaving(true);
      setCycleError("");

      const response = await fetch(
        `${API_URL}/commitments/${target.commitment_id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "BLOCKED",
            reason: t("cycle.blockedReason", {
              chain: cycleReport.chain.join(" → "),
            }),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Failed to mark the commitment as blocked"
        );
      }

      setCycleReport(null);
      setDependencyDraft({ predecessor: "", successor: "" });
      setSelectedId(target.commitment_id);
      await reloadData(target.commitment_id);
    } catch (err) {
      setCycleError(te(err.message));
    } finally {
      setDependencySaving(false);
    }
  }

  if (loading) {
    return <div className="message">{t("app.loading")}</div>;
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

  // The API sends a stable `type` plus the record ids; the English
  // `message` is only a fallback. Rebuilding the sentence here keeps the
  // consistency screen in the same language as the rest of the UI.
  function describeConflict(conflict) {
    const ids = conflict.commitment_ids ?? [];

    switch (conflict.type) {
      case "CYCLE":
        return t("consistency.cycle", { owners: names(ids, byId) });

      case "ORDER_VIOLATION": {
        const successor = byId[ids[0]];
        const predecessor = byId[ids[1]];

        return t("consistency.orderViolation", {
          successor: successor?.owner ?? `#${ids[0]}`,
          predecessor: predecessor?.owner ?? `#${ids[1]}`,
          status: predecessor
            ? t(
                `status.${predecessor.status}`,
                {},
                predecessor.status.replace("_", " ")
              )
            : "?",
        });
      }

      case "DATE_INVERSION": {
        const successor = byId[ids[0]];
        const predecessor = byId[ids[1]];

        return t("consistency.dateInversion", {
          successor: successor?.owner ?? `#${ids[0]}`,
          successorDate: formatDate(successor?.due_date),
          predecessor: predecessor?.owner ?? `#${ids[1]}`,
          predecessorDate: formatDate(predecessor?.due_date),
        });
      }

      case "DUPLICATE": {
        const first = byId[ids[0]];

        return t("consistency.duplicate", {
          owner: first?.owner ?? "?",
          count: ids.length,
          ids: ids.map((id) => `#${id}`).join(", "),
        });
      }

      case "STALE_DECISION": {
        const commitment = byId[ids[0]];
        const linkedDecision = decisions.find(
          (item) => item.id === conflict.decision_ids?.[0]
        );

        return t("consistency.staleDecision", {
          owner: commitment?.owner ?? "?",
          status: commitment
            ? t(
                `status.${commitment.status}`,
                {},
                commitment.status.replace("_", " ")
              )
            : "?",
          title: linkedDecision?.title ?? "?",
          decisionStatus: linkedDecision
            ? t(
                `consistency.decisionStatus.${linkedDecision.status}`,
                {},
                linkedDecision.status.toLowerCase()
              )
            : "?",
        });
      }

      default:
        return te(conflict.message);
    }
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

  const pendingTotal = pendingCandidates.total;
  const openCommitments = graph.nodes.filter(
    (node) => node.status !== "COMPLETED"
  ).length;

  // Local calendar day, not a UTC instant: an evening in UTC+8 must not
  // mark today's due date as overdue.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;
  const isOverdue = (node) =>
    node.due_date && node.due_date < today && node.status !== "COMPLETED";
  const overdueCommitments = graph.nodes.filter(isOverdue);

  // Everything the user could act on, ordered by what unblocks the most:
  // a cycle breaks the plan, a conflict undermines the record, and
  // unreviewed candidates are simply work in the queue.
  const attention = [];

  if (graph.has_cycles) {
    attention.push({
      key: "cycles",
      tag: t("overview.tagPlan"),
      message: t("overview.attentionCycle"),
      action: t("overview.actionOpenPlan"),
      view: "plan",
    });
  }

  if (conflicts.length > 0) {
    attention.push({
      key: "conflicts",
      tag: t("overview.tagConsistency"),
      message: tp("overview.attentionConflicts", conflicts.length, {
        count: conflicts.length,
        message: describeConflict(conflicts[0]),
      }),
      action: t("overview.actionReview"),
      view: "consistency",
    });
  }

  if (pendingTotal > 0) {
    attention.push({
      key: "pending",
      tag: t("overview.tagIntake"),
      message: tp("overview.attentionPending", pendingTotal, {
        count: pendingTotal,
      }),
      action: t("overview.actionReview"),
      view: "intake",
    });
  }

  if (overdueCommitments.length > 0) {
    attention.push({
      key: "overdue",
      tag: t("overview.tagCommitments"),
      message: tp("overview.attentionOverdue", overdueCommitments.length, {
        count: overdueCommitments.length,
        owner: overdueCommitments[0].owner,
        date: formatDate(overdueCommitments[0].due_date),
      }),
      action: t("overview.actionReview"),
      view: "plan",
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="brand">{t("app.brand")}</div>
            <div className="brand-subtitle">{t("app.tagline")}</div>
          </div>

          <div className="topbar-right">
            {conflicts.length > 0 && (
              <a className="topbar-conflicts" href="#consistency">
                {tp("app.conflict", conflicts.length, {
                  count: conflicts.length,
                })}
              </a>
            )}

            <ProjectSwitcher
              projects={projects}
              activeProject={project}
              onSelect={selectProject}
              onCreate={createProject}
              onDelete={deleteProject}
            />

            <LanguageToggle />
          </div>
        </div>
      </header>

      <Sidebar
        active={view}
        counts={{ intake: pendingTotal, consistency: conflicts.length }}
      />

      <main className="dashboard">
        {error && (
          <div className="message error" role="alert">
            {t("app.error", { message: error })}
          </div>
        )}

        {view === "overview" && (
          <>
            <section className="hero">
              <p className="eyebrow">{t("overview.eyebrow")}</p>
              <h1>{t("overview.title")}</h1>
              <p>{t("overview.subtitle")}</p>
            </section>

            <div className="kpi-grid">
              <article className="card kpi">
                <p className="kpi-label">{t("overview.decisions")}</p>
                <p className="kpi-value">{decisions.length}</p>
                <p className="kpi-hint">{t("overview.decisionsHint")}</p>
                <a className="text-link" href="#decisions">
                  {t("overview.openDecisions")}
                </a>
              </article>

              <article className="card kpi">
                <p className="kpi-label">{t("overview.commitments")}</p>
                <p className="kpi-value">{graph.nodes.length}</p>
                <p className="kpi-hint">
                  {t("overview.commitmentsHint", {
                    count: openCommitments,
                  })}
                </p>
                <a className="text-link" href="#plan">
                  {t("overview.openPlan")}
                </a>
              </article>

              <article className="card kpi">
                <p className="kpi-label">{t("overview.consistency")}</p>
                <p className="kpi-value">{conflicts.length}</p>
                <p className="kpi-hint">
                  {conflicts.length === 0
                    ? t("overview.consistencyClean")
                    : t("overview.consistencyDirty")}
                </p>
                <a className="text-link" href="#consistency">
                  {t("overview.openCheck")}
                </a>
              </article>

              <article className="card kpi">
                <p className="kpi-label">{t("overview.pending")}</p>
                <p className="kpi-value">{pendingTotal}</p>
                <p className="kpi-hint">{t("overview.pendingHint")}</p>
                <a className="text-link" href="#intake">
                  {t("overview.openIntake")}
                </a>
              </article>
            </div>

            <section className="card attention-card">
              <p className="eyebrow">{t("overview.attention")}</p>

              {attention.length === 0 ? (
                <p className="muted">{t("overview.attentionEmpty")}</p>
              ) : (
                <ul className="attention-list">
                  {attention.map((item) => (
                    <li className="attention-row" key={item.key}>
                      <span className="attention-tag">{item.tag}</span>

                      <p>{item.message}</p>

                      <a className="text-link" href={`#${item.view}`}>
                        {item.action}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {view === "decisions" && (
          <ViewHeader
            eyebrow={t("decisions.eyebrow")}
            title={t("decisions.title")}
          >
            {t("decisions.subtitle")}
          </ViewHeader>
        )}

        {view === "decisions" && (
          <div className="dashboard-grid">
            <section className="card decision-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">{t("decisions.cardEyebrow")}</p>

                  <div className="decision-title-row">
                    <h2>{decision?.title || t("decisions.none")}</h2>

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
                      {t("decisions.edit")}
                    </button>
                  )}
                </div>
              </div>

              {editingDecision ? (
                <div className="decision-editor">
                  <input
                    type="text"
                    placeholder={t("decisions.titlePlaceholder")}
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
                    placeholder={t("decisions.rationalePlaceholder")}
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
                    <option value="CONFIRMED">
                      {t("decisions.statusConfirmed")}
                    </option>
                    <option value="SUPERSEDED">
                      {t("decisions.statusSuperseded")}
                    </option>
                    <option value="REVOKED">
                      {t("decisions.statusRevoked")}
                    </option>
                  </select>

                  <input
                    type="text"
                    placeholder={t("decisions.reasonPlaceholder")}
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
                      {updatingDecision
                        ? t("decisions.saving")
                        : t("decisions.save")}
                    </button>

                    <button
                      className="secondary-button"
                      onClick={() => setEditingDecision(false)}
                    >
                      {t("common.cancel")}
                    </button>
                  </div>

                  {decisionError && (
                    <p className="pipeline-error">{decisionError}</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="rationale">
                    <span>{t("decisions.rationale")}</span>
                    <p>{decision?.rationale || t("decisions.noRationale")}</p>
                  </div>

                  <div className="trace-source">
                    {t("decisions.sourceDiscussion", {
                      id: decision?.source_discussion_id ?? "—",
                    })}
                  </div>
                </>
              )}

              {decisionTraceError && (
                <p className="pipeline-error">
                  {t("decisions.traceError", { message: decisionTraceError })}
                </p>
              )}

              {decision && (
                <>
                  <div className="decision-subsection">
                    <div className="decision-subheading">
                      <span>{t("decisions.impactEyebrow")}</span>

                      {currentDecisionImpact?.has_changes && (
                        <span className="change-warning">
                          {t("decisions.changed", {
                            count: currentDecisionImpact.change_count,
                          })}
                        </span>
                      )}
                    </div>

                    {currentDecisionImpact &&
                    currentDecisionImpact.affected_commitments.length > 0 ? (
                      currentDecisionImpact.affected_commitments.map((item) => (
                        <div
                          className="linked-commitment"
                          key={item.id}
                          onClick={() =>
                            openImpact(item.id, "DELAYED")
                          }
                        >
                          <strong>{item.owner}</strong>
                          <span>
                            #{item.id} ·{" "}
                            {t(
                              `status.${item.status}`,
                              {},
                              item.status.replace("_", " ")
                            )}
                          </span>

                          {item.downstream.length > 0 ? (
                            <span className="downstream-note">
                              {t("decisions.affects", {
                                names: names(item.downstream, byId),
                              })}
                            </span>
                          ) : (
                            <span className="downstream-note dim">
                              {t("decisions.noDownstream")}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="muted">{t("decisions.noLinked")}</p>
                    )}
                  </div>

                  <div className="decision-subsection">
                    <div className="decision-subheading">
                      <span>{t("decisions.historyEyebrow")}</span>

                      {decisionHistory.total > 0 && (
                        <span className="subheading-note">
                          {t("common.newestFirst")}
                        </span>
                      )}
                    </div>

                    {decisionHistory.total > 0 ? (
                      <>
                        <div
                          className={
                            decisionHistory.loading
                              ? "timeline is-loading"
                              : "timeline"
                          }
                          aria-busy={decisionHistory.loading}
                        >
                          {decisionHistory.items.map((item) => (
                            <div className="timeline-item" key={item.id}>
                              <div className="timeline-dot" />

                              <div>
                                <strong>
                                  {item.old_title} → {item.new_title}
                                </strong>

                                {item.old_status !== item.new_status && (
                                  <span className="history-status">
                                    {t(
                                      `status.${item.old_status}`,
                                      {},
                                      item.old_status.replace("_", " ")
                                    )}
                                    {" → "}
                                    {t(
                                      `status.${item.new_status}`,
                                      {},
                                      item.new_status.replace("_", " ")
                                    )}
                                  </span>
                                )}

                                <p>
                                  {item.reason || t("common.noReason")}
                                </p>

                                <span>
                                  {formatDateTime(item.changed_at)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <Pagination
                          total={decisionHistory.total}
                          limit={decisionHistory.limit}
                          offset={decisionHistory.offset}
                          onChange={decisionHistory.setOffset}
                          label={t("decisions.historyLabel")}
                          busy={decisionHistory.loading}
                        />

                        {decisionHistory.error && (
                          <p className="pipeline-error">
                            {te(decisionHistory.error)}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="muted">{t("decisions.noHistory")}</p>
                    )}
                  </div>
                </>
              )}
            </section>

            <ImpactPanel
              key={impactPanelKey}
              selectedNode={selectedNode}
              currentImpact={currentImpact}
              whatIf={currentWhatIf}
              whatIfStatus={whatIfStatus}
              onPreview={previewImpact}
              onStatusChange={setWhatIfStatus}
              onClose={closeImpact}
              previewOpen={whatIfOpen}
              impactLoading={impactLoading}
              previewLoading={whatIfLoading}
              error={whatIfError}
              byId={byId}
              variant="card"
            />
          </div>
        )}

        {view === "plan" && (
          <ViewHeader eyebrow={t("plan.eyebrow")} title={t("plan.title")}>
            {t("plan.subtitle")}
          </ViewHeader>
        )}

        {view === "plan" && (
          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("plan.sectionEyebrow")}</p>
                <h2>{t("plan.topological")}</h2>
              </div>
            </div>

            {graph.has_cycles && (
              <div className="cycle-banner">
                <strong>{t("plan.cycleDetected")}</strong>
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
                const note = stateNote(analysis, byId, t);
                const risk = ["BLOCKED", "CYCLIC"].includes(analysis?.state);

                return (
                  <div
                    className="plan-row"
                    key={node.id}
                    onClick={() => openImpact(node.id, "DELAYED")}
                  >
                    <span className="plan-index">{index + 1}</span>

                    <div className="plan-owner">
                      <strong>{node.owner}</strong>
                      <span>{t("plan.commitment", { id: node.id })}</span>
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
                    onClick={() => openImpact(node.id, "DELAYED")}
                  >
                    <span className="plan-index">↻</span>

                    <div className="plan-owner">
                      <strong>{node.owner}</strong>
                      <span>{t("plan.commitment", { id: node.id })}</span>
                    </div>

                    <StatusBadge status={node.status} />

                    <span className="plan-note risk">
                      {stateNote(analysis, byId, t)}
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
                    onClick={() => openImpact(node.id, "DELAYED")}
                  >
                    <span className="plan-index">—</span>

                    <div className="plan-owner">
                      <strong>{node.owner}</strong>
                      <span>{t("plan.commitment", { id: node.id })}</span>
                    </div>

                    <StatusBadge status={node.status} />

                    <span className="plan-note">
                      {stateNote(analysis, byId, t)} ·{" "}
                      {t("plan.blockedByCycle")}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {view === "consistency" && (
          <ViewHeader
            eyebrow={t("consistency.eyebrow")}
            title={t("consistency.title")}
          >
            {t("consistency.subtitle")}
          </ViewHeader>
        )}

        {view === "consistency" && (
          <section className="section-block">
            <div className="card conflict-card">
              {conflicts.length === 0 ? (
                <div className="conflicts-clean">
                  <span className="clean-dot" />
                  {t("consistency.clean")}
                </div>
              ) : (
                conflicts.map((conflict, index) => (
                  <div className="conflict-row" key={index}>
                    <span
                      className={`severity-badge severity-${conflict.severity.toLowerCase()}`}
                    >
                      {t(
                        `consistency.severity.${conflict.severity}`,
                        {},
                        conflict.severity
                      )}
                    </span>

                    <span className="conflict-type">
                      {t(
                        `consistency.type.${conflict.type}`,
                        {},
                        conflict.type.replace("_", " ")
                      )}
                    </span>

                    <p>{describeConflict(conflict)}</p>

                    <div className="conflict-refs">
                      {conflict.commitment_ids.map((id) => (
                        <button
                          className="ref-chip"
                          key={`commitment-${id}`}
                          title={t("consistency.openCommitment")}
                          onClick={() => {
                            setSelectedId(id);
                            navigate("audit");
                          }}
                        >
                          {byId[id]?.owner ?? "?"} #{id}
                        </button>
                      ))}

                      {conflict.decision_ids.map((id) => (
                        <button
                          className="ref-chip decision-chip"
                          key={`decision-${id}`}
                          title={t("consistency.openDecision")}
                          onClick={() => {
                            setDecisionId(id);
                            navigate("decisions");
                          }}
                        >
                          {t("consistency.decision", { id })}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {view === "dependencies" && (
          <ViewHeader
            eyebrow={t("dependencies.eyebrow")}
            title={t("dependencies.title")}
          >
            {t("dependencies.subtitle")}
          </ViewHeader>
        )}

        {view === "dependencies" && (
          <section className="card link-card">
            <p className="eyebrow">{t("dependencies.newEyebrow")}</p>
            <h2>{t("dependencies.newTitle")}</h2>
            <p className="card-hint">{t("dependencies.newHint")}</p>

            <form className="link-form" onSubmit={addDependency}>
              <label className="link-field">
                <span>{t("dependencies.finishesFirst")}</span>
                <select
                  value={dependencyDraft.predecessor}
                  onChange={(event) =>
                    setDependencyDraft((draft) => ({
                      ...draft,
                      predecessor: event.target.value,
                    }))
                  }
                >
                  <option value="">{t("dependencies.choose")}</option>
                  {graph.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.owner} — {node.description}
                    </option>
                  ))}
                </select>
              </label>

              <span className="link-connector" aria-hidden="true">
                {t("dependencies.blocks")}
              </span>

              <label className="link-field">
                <span>{t("dependencies.startsAfter")}</span>
                <select
                  value={dependencyDraft.successor}
                  onChange={(event) =>
                    setDependencyDraft((draft) => ({
                      ...draft,
                      successor: event.target.value,
                    }))
                  }
                >
                  <option value="">{t("dependencies.choose")}</option>
                  {graph.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.owner} — {node.description}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="primary-button"
                disabled={dependencySaving}
              >
                {dependencySaving
                  ? t("dependencies.adding")
                  : t("dependencies.add")}
              </button>
            </form>

            {dependencyError && (
              <p className="form-error" role="alert">
                {te(dependencyError)}
              </p>
            )}

            {dependencyNotice && (
              <div className="form-notice" role="status">
                <span className="form-notice-badge">
                  {t("dependencies.dateMismatch")}
                </span>

                <div className="form-notice-body">
                  <p>
                    {t("dependencies.dateNotice", {
                      successor: dependencyNotice.successor.owner,
                      successorId: dependencyNotice.successor.id,
                      successorDate: formatDate(
                        dependencyNotice.successor.due_date
                      ),
                      predecessor: dependencyNotice.predecessor.owner,
                      predecessorId: dependencyNotice.predecessor.id,
                      predecessorDate: formatDate(
                        dependencyNotice.predecessor.due_date
                      ),
                    })}
                  </p>
                  <p className="form-notice-hint">
                    {t("dependencies.dateSuggestion", {
                      successor: dependencyNotice.successor.owner,
                      predecessorDate: formatDate(
                        dependencyNotice.predecessor.due_date
                      ),
                    })}{" "}
                    {t("dependencies.dateSaved")}
                  </p>
                </div>

                <div className="form-notice-actions">
                  <button
                    type="button"
                    className="form-notice-undo"
                    onClick={() =>
                      removeDependency(dependencyNotice.dependency_id)
                    }
                    disabled={dependencySaving}
                  >
                    {dependencySaving
                      ? t("common.undoing")
                      : t("common.undo")}
                  </button>

                  <button
                    type="button"
                    className="form-notice-close"
                    onClick={() => setDependencyNotice(null)}
                    aria-label={t("dependencies.dismissWarning")}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {view === "dependencies" && (
          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("dependencies.graphEyebrow")}</p>
                <h2>{t("dependencies.graphTitle")}</h2>
              </div>
              <span>{t("dependencies.graphHint")}</span>
            </div>

            <div
              className={`dependencies-workspace ${
                whatIfOpen && selectedNode ? "has-impact" : ""
              }`}
            >
              <div className="card dependencies-graph-card">
                {viewingSnapshotError && (
                  <p className="pipeline-error" role="alert">
                    {te(viewingSnapshotError)}
                  </p>
                )}

                {viewingSnapshotLoading ? (
                  <p className="muted">{t("common.loading")}</p>
                ) : viewingSnapshot ? (
                  <>
                    <div className="snapshot-viewing">
                      <span className="type-badge type-history">
                        {t("dependencies.snapshot")}
                      </span>

                      <strong>{viewingSnapshot.title}</strong>

                      <span className="muted">
                        {formatSnapshotTime(viewingSnapshot.created_at)}
                      </span>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setViewingSnapshot(null);
                          setViewingSnapshotError("");
                        }}
                      >
                        {t("dependencies.backToLive")}
                      </button>
                    </div>

                    <GraphView
                      graph={viewingSnapshot.graph}
                      selectedId={null}
                      onSelect={() => {}}
                    />
                  </>
                ) : (
                  <GraphView
                    graph={graph}
                    selectedId={selectedId}
                    onSelect={(id) => openImpact(id, "DELAYED")}
                    highlightIds={
                      currentWhatIf?.affected.map((item) => item.id) ?? []
                    }
                  />
                )}
              </div>

              {whatIfOpen && selectedNode && (
                <ImpactPanel
                  key={impactPanelKey}
                  selectedNode={selectedNode}
                  currentImpact={currentImpact}
                  whatIf={currentWhatIf}
                  whatIfStatus={whatIfStatus}
                  onPreview={previewImpact}
                  onStatusChange={setWhatIfStatus}
                  onClose={closeImpact}
                  previewOpen={whatIfOpen}
                  impactLoading={impactLoading}
                  previewLoading={whatIfLoading}
                  error={whatIfError}
                  byId={byId}
                  variant="docked"
                />
              )}
            </div>

            <div className="card">
              <p className="eyebrow">{t("dependencies.snapshotsEyebrow")}</p>
              <h2>{t("dependencies.snapshotsTitle")}</h2>
              <p className="muted snapshot-hint">
                {t("dependencies.snapshotsHint")}
              </p>

              <form className="snapshot-form" onSubmit={saveSnapshot}>
                <input
                  type="text"
                  placeholder={t("dependencies.snapshotPlaceholder")}
                  value={snapshotTitle}
                  onChange={(event) => setSnapshotTitle(event.target.value)}
                />

                <button
                  type="submit"
                  className="secondary-button"
                  disabled={snapshotSaving || !snapshotTitle.trim()}
                >
                  {snapshotSaving
                    ? t("dependencies.savingSnapshot")
                    : t("dependencies.saveSnapshot")}
                </button>
              </form>

              {snapshotNotice && (
                <p className="pipeline-notice" aria-live="polite">
                  {snapshotNotice}
                </p>
              )}

              {snapshotError && (
                <p className="pipeline-error" role="alert">
                  {te(snapshotError)}
                </p>
              )}

              {snapshots.length === 0 ? (
                <p className="muted">{t("dependencies.noSnapshots")}</p>
              ) : (
                <ul className="snapshot-list">
                  {snapshots.map((snapshot, index) => (
                    <li className="snapshot-item" key={snapshot.id}>
                      <div className="snapshot-item-text">
                        <strong>{snapshot.title}</strong>
                        <span className="muted">
                          {formatSnapshotTime(snapshot.created_at)} ·{" "}
                          {tp(
                            "dependencies.snapshotCommitments",
                            snapshot.node_count ?? 0,
                            { count: snapshot.node_count ?? 0 }
                          )}
                        </span>

                        {index < snapshots.length - 1 && (
                          <button
                            type="button"
                            className="snapshot-compare-link"
                            onClick={() => compareWithPrevious(index)}
                          >
                            {t("dependencies.compareWithPrevious")}
                          </button>
                        )}
                      </div>

                      <div className="snapshot-item-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => viewSnapshot(snapshot)}
                        >
                          {t("common.view")}
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => downloadSnapshotJson(snapshot)}
                        >
                          JSON
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => deleteSnapshot(snapshot.id)}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="snapshot-compare" id="snapshot-diff">
                <p className="eyebrow">
                  {t("dependencies.compareEyebrow")}
                </p>
                <h3>{t("dependencies.compareTitle")}</h3>
                <p className="muted snapshot-compare-hint">
                  {t("dependencies.compareHint")}
                </p>

                {snapshots.length < 2 ? (
                  <p className="diff-none">
                    {t("dependencies.compareNeedTwo")}
                  </p>
                ) : (
                  <form
                    className="snapshot-compare-form"
                    onSubmit={compareSnapshots}
                    aria-label={t("dependencies.compareTitle")}
                  >
                    <label className="snapshot-select">
                      <span>{t("dependencies.compareFrom")}</span>
                      <select
                        value={compareFromId}
                        onChange={(event) => {
                          setCompareFromId(event.target.value);
                          setSnapshotDiff(null);
                          setSnapshotDiffError("");
                        }}
                      >
                        <option value="">
                          {t("dependencies.compareSelect")}
                        </option>
                        {snapshots.map((snapshot) => (
                          <option value={snapshot.id} key={snapshot.id}>
                            {snapshot.title} ·{" "}
                            {formatSnapshotTime(snapshot.created_at)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <span className="compare-arrow" aria-hidden="true">
                      →
                    </span>

                    <label className="snapshot-select">
                      <span>{t("dependencies.compareTo")}</span>
                      <select
                        value={compareToId}
                        onChange={(event) => {
                          setCompareToId(event.target.value);
                          setSnapshotDiff(null);
                          setSnapshotDiffError("");
                        }}
                      >
                        <option value="">
                          {t("dependencies.compareSelect")}
                        </option>
                        {snapshots.map((snapshot) => (
                          <option value={snapshot.id} key={snapshot.id}>
                            {snapshot.title} ·{" "}
                            {formatSnapshotTime(snapshot.created_at)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={
                        snapshotDiffLoading ||
                        !compareFromId ||
                        !compareToId ||
                        String(compareFromId) === String(compareToId)
                      }
                    >
                      {snapshotDiffLoading
                        ? t("dependencies.comparing")
                        : t("dependencies.compareAction")}
                    </button>
                  </form>
                )}

                {snapshots.length >= 2 &&
                  compareFromId &&
                  compareToId &&
                  String(compareFromId) === String(compareToId) && (
                    <p className="diff-none">
                      {t("dependencies.compareSame")}
                    </p>
                  )}

                {snapshotDiffError && (
                  <p className="pipeline-error" role="alert">
                    {te(snapshotDiffError)}
                  </p>
                )}

                {snapshotDiffLoading && (
                  <p className="muted" role="status">
                    {t("common.loading")}
                  </p>
                )}

                {snapshotDiff && <SnapshotDiff diff={snapshotDiff} />}
              </div>
            </div>
          </section>
        )}

        {view === "plan" && (
          <section className="section-block">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("plan.commitmentsEyebrow")}</p>
                <h2>{t("plan.commitments")}</h2>
              </div>
              <span>
                {tp("plan.commitmentCount", graph.nodes.length, {
                  count: graph.nodes.length,
                })}
              </span>
            </div>

            <div className="commitment-grid">
              {graph.nodes.map((commitment) => (
                <article
                  className={`card commitment-card ${
                    commitment.id === selectedId ? "selected" : ""
                  }`}
                  key={commitment.id}
                  onClick={() => openImpact(commitment.id, "DELAYED")}
                >
                  <div className="commitment-top">
                    <div className="avatar">
                      {commitment.owner.charAt(0)}
                    </div>

                    <div>
                      <h3>{commitment.owner}</h3>
                      <span>
                        {t("plan.commitment", { id: commitment.id })}
                      </span>
                    </div>

                    <StatusBadge status={commitment.status} />
                  </div>

                  <p className="commitment-description">
                    {commitment.description}
                  </p>

                  <div className="due-date">
                    <span>{t("plan.dueDate")}</span>
                    <strong
                      className={isOverdue(commitment) ? "due-overdue" : ""}
                    >
                      {commitment.due_date
                        ? formatDate(commitment.due_date)
                        : t("common.notSet")}
                      {isOverdue(commitment)
                        ? ` · ${t("plan.overdue")}`
                        : ""}
                    </strong>
                  </div>

                  <button
                    type="button"
                    className="impact-trigger"
                    onClick={(event) => {
                      event.stopPropagation();
                      openImpact(commitment.id, "DELAYED");
                    }}
                  >
                    {t("impact.whatIfDelayed")}
                  </button>

                  {editingId === commitment.id ? (
                    <div className="status-editor">
                      <select
                        value={newStatus}
                        onChange={(event) => setNewStatus(event.target.value)}
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

                      <input
                        type="text"
                        placeholder={t("common.reason")}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />

                      {editorError && (
                        <p className="pipeline-error">{te(editorError)}</p>
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
                          {updating
                            ? t("common.updating")
                            : t("plan.updateStatus")}
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
                          {t("common.cancel")}
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
                      {t("plan.changeStatus")}
                    </button>
                  )}
                </article>
              ))}
            </div>

            <ImpactPanel
              key={impactPanelKey}
              selectedNode={selectedNode}
              currentImpact={currentImpact}
              whatIf={currentWhatIf}
              whatIfStatus={whatIfStatus}
              onPreview={previewImpact}
              onStatusChange={setWhatIfStatus}
              onClose={closeImpact}
              previewOpen={whatIfOpen}
              impactLoading={impactLoading}
              previewLoading={whatIfLoading}
              error={whatIfError}
              byId={byId}
              variant="card"
            />
          </section>
        )}

        {view === "intake" && (
          <ViewHeader
            eyebrow={t("intake.eyebrow")}
            title={t("intake.title")}
          >
            {t("intake.subtitle")}
          </ViewHeader>
        )}

        {view === "intake" && (
          <section className="section-block">
            <DiscussionsPanel
              page={discussions}
              projectId={project?.id}
              reload={reloadData}
            />

            <CandidatesPanel
              pending={pendingCandidates}
              reviewed={reviewedCandidates}
              reload={reloadData}
            />
          </section>
        )}

        {view === "dependencies" && (
          <section className="card">
            <p className="eyebrow">{t("dependencies.traceEyebrow")}</p>
            <h2>{t("dependencies.traceTitle")}</h2>

            {graph.edges.length === 0 && (
              <p className="muted">{t("dependencies.none")}</p>
            )}

            {graph.edges.map((dependency) => {
              const predecessor = byId[dependency.predecessor_commitment_id];
              const successor = byId[dependency.successor_commitment_id];

              return (
                <div className="dependency" key={dependency.id}>
                  <div className="dependency-node">
                    <strong>
                      {predecessor?.owner || t("dependencies.unknown")}
                    </strong>
                    <span>
                      {t("plan.commitment", {
                        id: dependency.predecessor_commitment_id,
                      })}
                    </span>
                  </div>

                  <div className="dependency-arrow">
                    <span>
                      {t(
                        `type.${dependency.dependency_type}`,
                        {},
                        dependency.dependency_type
                      )}
                    </span>
                    <div>→</div>
                  </div>

                  <div className="dependency-node">
                    <strong>
                      {successor?.owner || t("dependencies.unknown")}
                    </strong>
                    <span>
                      {t("plan.commitment", {
                        id: dependency.successor_commitment_id,
                      })}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="dependency-remove"
                    onClick={() => removeDependency(dependency.id)}
                    disabled={dependencySaving}
                    aria-label={t("dependencies.removeAria", {
                      from:
                        predecessor?.owner || t("dependencies.unknown"),
                      to: successor?.owner || t("dependencies.unknown"),
                    })}
                  >
                    {t("dependencies.remove")}
                  </button>
                </div>
              );
            })}
          </section>
        )}

        {view === "search" && (
          <ViewHeader
            eyebrow={t("search.eyebrow")}
            title={t("nav.search")}
          >
            {t("search.subtitle")}
          </ViewHeader>
        )}

        {view === "search" && (
          <section className="section-block">
            <SearchPanel
              projectId={project?.id}
              onOpenDecision={(id) => setDecisionId(id)}
              onOpenCommitment={(id) => setSelectedId(id)}
              onNavigate={navigate}
            />
          </section>
        )}

        {view === "audit" && (
          <ViewHeader eyebrow={t("audit.eyebrow")} title={t("audit.title")}>
            {t("audit.subtitle")}
          </ViewHeader>
        )}

        {view === "audit" && (
          <section className="card">
            <div className="card-header">
              <div>
                <h2>{t("audit.changeHistory")}</h2>
              </div>

              {graph.nodes.length > 0 && (
                <select
                  className="decision-select"
                  value={selectedId ?? ""}
                  aria-label={t("audit.commitmentToAudit")}
                  onChange={(event) =>
                    setSelectedId(Number(event.target.value))
                  }
                >
                  {graph.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      #{node.id} {node.owner} ·{" "}
                      {t(
                        `status.${node.status}`,
                        {},
                        node.status.replace("_", " ")
                      )}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedNode && commitmentHistory.total > 1 && (
              <p className="muted source-note">{t("audit.newestFirst")}</p>
            )}

            {commitmentHistory.total > 0 ? (
              <>
                <div
                  className={
                    commitmentHistory.loading
                      ? "timeline is-loading"
                      : "timeline"
                  }
                  aria-busy={commitmentHistory.loading}
                >
                  {commitmentHistory.items.map((item) => (
                    <div className="timeline-item" key={item.id}>
                      <div className="timeline-dot" />

                      <div>
                        <strong>
                          {t(
                            `status.${item.old_status}`,
                            {},
                            item.old_status.replace("_", " ")
                          )}
                          {" → "}
                          {t(
                            `status.${item.new_status}`,
                            {},
                            item.new_status.replace("_", " ")
                          )}
                        </strong>

                        <p>{item.reason || t("common.noReason")}</p>

                        <span>{formatDateTime(item.changed_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <Pagination
                  total={commitmentHistory.total}
                  limit={commitmentHistory.limit}
                  offset={commitmentHistory.offset}
                  onChange={commitmentHistory.setOffset}
                  label={t("audit.historyLabel")}
                  busy={commitmentHistory.loading}
                />

                {commitmentHistory.error && (
                  <p className="pipeline-error">
                    {te(commitmentHistory.error)}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">{t("audit.noHistory")}</p>
            )}
          </section>
        )}

      </main>

      {cycleReport && (
        <CycleDialog
          report={cycleReport}
          error={cycleError}
          busy={dependencySaving}
          onClose={() => setCycleReport(null)}
          onMarkBlocked={markCycleTaskBlocked}
          onRemoveLink={removeDependency}
        />
      )}
    </div>
  );
}

export default App;
