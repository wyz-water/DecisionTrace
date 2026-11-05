import { useEffect, useState } from "react";
import "./App.css";
import DiscussionsPanel from "./components/DiscussionsPanel.jsx";
import CandidatesPanel from "./components/CandidatesPanel.jsx";
import CycleDialog from "./components/CycleDialog.jsx";
import Pagination from "./components/Pagination.jsx";
import ProjectSwitcher from "./components/ProjectSwitcher.jsx";
import SearchPanel from "./components/SearchPanel.jsx";
import Sidebar from "./components/Sidebar.jsx";
import StatusBadge from "./components/StatusBadge.jsx";
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
  const owners = {};
  for (const node of graph.nodes) {
    owners[node.id] = node.owner;
  }

  return (
    <div className="graph-blocked" role="alert">
      <span className="graph-blocked-badge">CYCLE</span>

      <div className="graph-blocked-body">
        <p className="graph-blocked-title">
          The graph contains a cycle and cannot be ordered
        </p>

        <p>
          These commitments wait on each other, so no start-to-finish order
          exists and the graph is not drawn.
        </p>

        <ul className="graph-blocked-loops">
          {graph.cycles.map((cycle) => (
            <li key={cycle.join("-")}>
              {cycle.map((id) => owners[id] ?? `#${id}`).join(" → ")}
            </li>
          ))}
        </ul>

        <p className="graph-blocked-hint">
          Remove one of these links in the dependency list below to break the
          loop.
        </p>
      </div>
    </div>
  );
}

function GraphView({ graph, selectedId, onSelect }) {
  // A cycle has no topological order, so there is nothing honest to draw.
  if (graph.has_cycles) {
    return <CycleNotice graph={graph} />;
  }

  const layout = computeLayout(graph);

  if (!layout) {
    return <p className="muted">No commitments to draw yet.</p>;
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
  const [selectedId, setSelectedId] = useState(null);
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
        setError(
          "No projects yet. Create one from the project switcher, " +
            "top right of the page."
        );
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
      setError(err.message);
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

  function selectProject(nextProject) {
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
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/projects/${project.id}/snapshots?limit=20`
      );

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setSnapshots(data.items ?? []);
    } catch {
      // A failed list refresh keeps the previous list on screen.
    }
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

      downloadGraphSvg(title);
      setSnapshotTitle("");

      const nodes = snapshot.graph?.nodes?.length ?? 0;
      const edges = snapshot.graph?.edges?.length ?? 0;

      setSnapshotNotice(
        `Snapshot saved — ${nodes} ${nodes === 1 ? "commitment" : "commitments"}, ` +
          `${edges} ${edges === 1 ? "dependency" : "dependencies"}. ` +
          "The SVG was downloaded."
      );

      await loadSnapshots();
    } catch (err) {
      setSnapshotError(err.message);
    } finally {
      setSnapshotSaving(false);
    }
  }

  function downloadGraphSvg(title) {
    const svg = document.querySelector(".graph-svg");

    if (!svg) {
      return;
    }

    // The node in the DOM is React-owned; serialize a detached copy.
    const clone = svg.cloneNode(true);
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      `${title.replace(/[^\w一-鿿]+/g, "-").toLowerCase() || "snapshot"}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadSnapshotJson(snapshot) {
    const blob = new Blob([JSON.stringify(snapshot.graph, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      `${snapshot.title.replace(/[^\w一-鿿]+/g, "-").toLowerCase() || "snapshot"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function deleteSnapshot(snapshotId) {
    if (!project?.id) {
      return;
    }

    try {
      await fetch(
        `${API_URL}/projects/${project.id}/snapshots/${snapshotId}`,
        { method: "DELETE" }
      );

      if (viewingSnapshot?.id === snapshotId) {
        setViewingSnapshot(null);
      }

      await loadSnapshots();
    } catch (err) {
      setSnapshotError(err.message || "Failed to delete the snapshot.");
    }
  }

  function formatSnapshotTime(value) {
    if (!value) {
      return "";
    }

    return value.replace("T", " ").slice(0, 16);
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

      await reloadData(selectedId);
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

      await reloadData(commitmentId);
    } catch (err) {
      setEditorError(err.message);
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
      setDependencyError(
        "Pick the commitment that finishes first and the one that starts after it."
      );
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
      setDependencyError(err.message);
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
        setCycleError(err.message);
      } else {
        setDependencyError(err.message);
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
            reason: `Circular dependency: ${cycleReport.chain.join(" -> ")}.`,
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
      setCycleError(err.message);
    } finally {
      setDependencySaving(false);
    }
  }

  if (loading) {
    return <div className="message">Loading DecisionTrace...</div>;
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

  const pendingTotal = pendingCandidates.total;
  const openCommitments = graph.nodes.filter(
    (node) => node.status !== "COMPLETED"
  ).length;

  // Local date (YYYY-MM-DD) so due-date comparisons are calendar days,
  // not instants. Overdue = past due and not finished.
  const today = new Date().toISOString().slice(0, 10);
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
      tag: "Plan",
      message:
        "A circular dependency is holding part of the plan out of order.",
      action: "Open plan",
      view: "plan",
    });
  }

  if (conflicts.length > 0) {
    attention.push({
      key: "conflicts",
      tag: "Consistency",
      message: `${conflicts.length} ${
        conflicts.length === 1 ? "record conflicts" : "records conflict"
      } — ${conflicts[0].message}`,
      action: "Review",
      view: "consistency",
    });
  }

  if (pendingTotal > 0) {
    attention.push({
      key: "pending",
      tag: "Intake",
      message: `${pendingTotal} extracted ${
        pendingTotal === 1 ? "candidate is" : "candidates are"
      } waiting for a human decision.`,
      action: "Review",
      view: "intake",
    });
  }

  if (overdueCommitments.length > 0) {
    attention.push({
      key: "overdue",
      tag: "Commitments",
      message: `${overdueCommitments.length} ${
        overdueCommitments.length === 1 ? "commitment is" : "commitments are"
      } past ${
        overdueCommitments.length === 1 ? "its" : "their"
      } due date — ${overdueCommitments[0].owner}'s was due ${
        overdueCommitments[0].due_date
      }.`,
      action: "Review",
      view: "plan",
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="brand">DecisionTrace</div>
            <div className="brand-subtitle">
              Decision intelligence & traceability
            </div>
          </div>

          <div className="topbar-right">
            {conflicts.length > 0 && (
              <a className="topbar-conflicts" href="#consistency">
                {conflicts.length}{" "}
                {conflicts.length === 1 ? "conflict" : "conflicts"}
              </a>
            )}

            <ProjectSwitcher
              projects={projects}
              activeProject={project}
              onSelect={selectProject}
              onCreate={createProject}
              onDelete={deleteProject}
            />
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
            Error: {error}
          </div>
        )}

        {view === "overview" && (
          <>
            <section className="hero">
              <p className="eyebrow">PROJECT OVERVIEW</p>
              <h1>Trace decisions to downstream impact.</h1>
              <p>
                Preserve the reasoning behind decisions, connect
                commitments, and understand what changes affect next.
              </p>
            </section>

            <div className="kpi-grid">
              <article className="card kpi">
                <p className="kpi-label">Decisions</p>
                <p className="kpi-value">{decisions.length}</p>
                <p className="kpi-hint">reasoning recorded</p>
                <a className="text-link" href="#decisions">
                  Open decisions
                </a>
              </article>

              <article className="card kpi">
                <p className="kpi-label">Commitments</p>
                <p className="kpi-value">{graph.nodes.length}</p>
                <p className="kpi-hint">{openCommitments} still open</p>
                <a className="text-link" href="#plan">
                  Open plan
                </a>
              </article>

              <article className="card kpi">
                <p className="kpi-label">Consistency</p>
                <p className="kpi-value">{conflicts.length}</p>
                <p className="kpi-hint">
                  {conflicts.length === 0
                    ? "no conflicts"
                    : "records to reconcile"}
                </p>
                <a className="text-link" href="#consistency">
                  Open check
                </a>
              </article>

              <article className="card kpi">
                <p className="kpi-label">Pending review</p>
                <p className="kpi-value">{pendingTotal}</p>
                <p className="kpi-hint">AI candidates</p>
                <a className="text-link" href="#intake">
                  Open intake
                </a>
              </article>
            </div>

            <section className="card attention-card">
              <p className="eyebrow">NEEDS ATTENTION</p>

              {attention.length === 0 ? (
                <p className="muted">
                  Nothing needs attention — the trace is consistent and
                  every candidate has been reviewed.
                </p>
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
          <ViewHeader eyebrow="DECIDE" title="Decisions">
            The reasoning commitments must stay true to, and what a
            change to it puts at risk.
          </ViewHeader>
        )}

        {view === "decisions" && (
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

                      {currentDecisionImpact?.has_changes && (
                        <span className="change-warning">
                          changed {currentDecisionImpact.change_count}× — linked
                          commitments may need review
                        </span>
                      )}
                    </div>

                    {currentDecisionImpact &&
                    currentDecisionImpact.affected_commitments.length > 0 ? (
                      currentDecisionImpact.affected_commitments.map((item) => (
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

                      {decisionHistory.total > 0 && (
                        <span className="subheading-note">newest first</span>
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

                        <Pagination
                          total={decisionHistory.total}
                          limit={decisionHistory.limit}
                          offset={decisionHistory.offset}
                          onChange={decisionHistory.setOffset}
                          label="Decision change history"
                          busy={decisionHistory.loading}
                        />

                        {decisionHistory.error && (
                          <p className="pipeline-error">
                            {decisionHistory.error}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="muted">No changes recorded yet.</p>
                    )}
                  </div>
                </>
              )}
            </section>

            <section
              className={`card impact-card ${
                currentImpact?.has_impact ? "impact-active" : ""
              }`}
            >
              <p className="eyebrow">IMPACT ANALYSIS</p>

              {currentImpact ? (
                <>
                  <h2>
                    {currentImpact.has_impact
                      ? "Downstream impact detected"
                      : "No active impact"}
                  </h2>

                  <p className="muted source-note">
                    Source: {selectedNode?.owner || "?"} · Commitment #
                    {currentImpact.commitment_id} ·{" "}
                    {currentImpact.commitment_status.replace("_", " ")}
                  </p>

                  {currentImpact.has_impact ? (
                    currentImpact.affected_commitments.map((item) => (
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
                  <h2>No commitment selected</h2>
                  <p className="muted">
                    Pick a commitment in the plan to see what a delay there
                    puts at risk.
                  </p>

                  <a className="text-link" href="#plan">
                    Open plan
                  </a>
                </>
              )}
            </section>
          </div>
        )}

        {view === "plan" && (
          <ViewHeader eyebrow="EXECUTE" title="Plan & commitments">
            The order work has to happen in, and the commitments that
            carry it.
          </ViewHeader>
        )}

        {view === "plan" && (
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
        )}

        {view === "consistency" && (
          <ViewHeader eyebrow="TRACE" title="Consistency">
            Duplicate and stale records the trace cannot reconcile —
            each one points at the commitments and decisions involved.
          </ViewHeader>
        )}

        {view === "consistency" && (
          <section className="section-block">
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
                          title="Open this commitment in the audit trail"
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
                          title="Open this decision"
                          onClick={() => {
                            setDecisionId(id);
                            navigate("decisions");
                          }}
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
        )}

        {view === "dependencies" && (
          <ViewHeader eyebrow="EXECUTE" title="Dependencies">
            What blocks what, and how far a delay travels downstream.
          </ViewHeader>
        )}

        {view === "dependencies" && (
          <section className="card link-card">
            <p className="eyebrow">NEW DEPENDENCY</p>
            <h2>Link two commitments</h2>
            <p className="card-hint">
              The first commitment has to finish before the second one can
              start. A link that would close a loop is refused before it is
              stored.
            </p>

            <form className="link-form" onSubmit={addDependency}>
              <label className="link-field">
                <span>Finishes first</span>
                <select
                  value={dependencyDraft.predecessor}
                  onChange={(event) =>
                    setDependencyDraft((draft) => ({
                      ...draft,
                      predecessor: event.target.value,
                    }))
                  }
                >
                  <option value="">Choose a commitment</option>
                  {graph.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.owner} — {node.description}
                    </option>
                  ))}
                </select>
              </label>

              <span className="link-connector" aria-hidden="true">
                blocks
              </span>

              <label className="link-field">
                <span>Starts after</span>
                <select
                  value={dependencyDraft.successor}
                  onChange={(event) =>
                    setDependencyDraft((draft) => ({
                      ...draft,
                      successor: event.target.value,
                    }))
                  }
                >
                  <option value="">Choose a commitment</option>
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
                {dependencySaving ? "Adding..." : "Add dependency"}
              </button>
            </form>

            {dependencyError && (
              <p className="form-error" role="alert">
                {dependencyError}
              </p>
            )}

            {dependencyNotice && (
              <div className="form-notice" role="status">
                <span className="form-notice-badge">DATE MISMATCH</span>

                <div className="form-notice-body">
                  <p>{dependencyNotice.message}</p>
                  <p className="form-notice-hint">
                    {dependencyNotice.suggestion} The link was saved — it is
                    listed on the consistency screen until the dates agree.
                  </p>
                </div>

                <div className="form-notice-actions">
                  <button
                    type="button"
                    className="form-notice-undo"
                    onClick={() => removeDependency(dependencyNotice.dependency_id)}
                    disabled={dependencySaving}
                  >
                    {dependencySaving ? "Undoing..." : "Undo"}
                  </button>

                  <button
                    type="button"
                    className="form-notice-close"
                    onClick={() => setDependencyNotice(null)}
                    aria-label="Dismiss the date warning"
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
                <p className="eyebrow">DEPENDENCY GRAPH</p>
                <h2>Work graph</h2>
              </div>
              <span>click a node to analyze it</span>
            </div>

            <div className="card">
              {viewingSnapshot ? (
                <>
                  <div className="snapshot-viewing">
                    <span className="type-badge type-history">SNAPSHOT</span>

                    <strong>{viewingSnapshot.title}</strong>

                    <span className="muted">
                      {formatSnapshotTime(viewingSnapshot.created_at)}
                    </span>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setViewingSnapshot(null)}
                    >
                      Back to live graph
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
                  onSelect={setSelectedId}
                />
              )}
            </div>

            <div className="card">
              <p className="eyebrow">GRAPH SNAPSHOTS</p>
              <h2>Meeting summaries as graphs</h2>
              <p className="muted snapshot-hint">
                Save the current graph with a title and timestamp — a
                visual summary of a meeting you can review later.
              </p>

              <form className="snapshot-form" onSubmit={saveSnapshot}>
                <input
                  type="text"
                  placeholder="Snapshot title (e.g. 2026-11-05 weekly sync)"
                  value={snapshotTitle}
                  onChange={(event) => setSnapshotTitle(event.target.value)}
                />

                <button
                  type="submit"
                  className="secondary-button"
                  disabled={snapshotSaving || !snapshotTitle.trim()}
                >
                  {snapshotSaving ? "Saving..." : "Save snapshot + SVG"}
                </button>
              </form>

              {snapshotNotice && (
                <p className="pipeline-notice" aria-live="polite">
                  {snapshotNotice}
                </p>
              )}

              {snapshotError && (
                <p className="pipeline-error" role="alert">
                  {snapshotError}
                </p>
              )}

              {snapshots.length === 0 ? (
                <p className="muted">No snapshots saved yet.</p>
              ) : (
                <ul className="snapshot-list">
                  {snapshots.map((snapshot) => (
                    <li className="snapshot-item" key={snapshot.id}>
                      <div className="snapshot-item-text">
                        <strong>{snapshot.title}</strong>
                        <span className="muted">
                          {formatSnapshotTime(snapshot.created_at)} ·{" "}
                          {snapshot.graph?.nodes?.length ?? 0} commitments
                        </span>
                      </div>

                      <div className="snapshot-item-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setViewingSnapshot(snapshot)}
                        >
                          View
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
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {view === "plan" && (
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
                    <strong
                      className={isOverdue(commitment) ? "due-overdue" : ""}
                    >
                      {commitment.due_date || "Not set"}
                      {isOverdue(commitment) ? " · overdue" : ""}
                    </strong>
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
        )}

        {view === "intake" && (
          <ViewHeader eyebrow="DECIDE" title="Intake & review">
            AI proposes candidates from meeting notes; you decide what
            becomes an authoritative record.
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

                  <button
                    type="button"
                    className="dependency-remove"
                    onClick={() => removeDependency(dependency.id)}
                    disabled={dependencySaving}
                    aria-label={`Remove dependency: ${
                      predecessor?.owner || "unknown"
                    } blocks ${successor?.owner || "unknown"}`}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </section>
        )}

        {view === "search" && (
          <ViewHeader eyebrow="TRACE" title="Search">
            Find any decision, commitment, discussion or change by
            keyword — including the reasoning and source context behind
            it.
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
          <ViewHeader eyebrow="TRACE" title="Audit trail">
            Every status change on the selected commitment, newest
            first, with the reason that was given.
          </ViewHeader>
        )}

        {view === "audit" && (
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Change history</h2>
              </div>

              {graph.nodes.length > 0 && (
                <select
                  className="decision-select"
                  value={selectedId ?? ""}
                  aria-label="Commitment to audit"
                  onChange={(event) =>
                    setSelectedId(Number(event.target.value))
                  }
                >
                  {graph.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      #{node.id} {node.owner} ·{" "}
                      {node.status.replace("_", " ")}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedNode && commitmentHistory.total > 1 && (
              <p className="muted source-note">Newest first</p>
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

                <Pagination
                  total={commitmentHistory.total}
                  limit={commitmentHistory.limit}
                  offset={commitmentHistory.offset}
                  onChange={commitmentHistory.setOffset}
                  label="Commitment change history"
                  busy={commitmentHistory.loading}
                />

                {commitmentHistory.error && (
                  <p className="pipeline-error">{commitmentHistory.error}</p>
                )}
              </>
            ) : (
              <p className="muted">No changes recorded yet.</p>
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
