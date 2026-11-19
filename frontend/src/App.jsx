import { useEffect, useRef, useState } from "react";
import "./App.css";
import DiscussionsPanel from "./components/DiscussionsPanel.jsx";
import CandidatesPanel from "./components/CandidatesPanel.jsx";
import ChainPanel from "./components/ChainPanel.jsx";
import ExecutePanel from "./components/ExecutePanel.jsx";
import ExecuteDecisions from "./components/ExecuteDecisions.jsx";
import TeacherDashboard from "./components/TeacherDashboard.jsx";
import DecisionCreateForm from "./components/DecisionCreateForm.jsx";
import LanguageToggle from "./components/LanguageToggle.jsx";
import ProjectSwitcher from "./components/ProjectSwitcher.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Pagination from "./components/Pagination.jsx";
import { useI18n } from "./i18n";
import { personColor } from "./personColors";
import { buildDecisionNumbers } from "./decisionNumbers";
import usePagedList from "./usePagedList.js";
import { readView } from "./views.js";

const API_URL = "http://127.0.0.1:8000";

// Page sizes are chosen per surface, not globally: the candidate grid is
// two columns, so 4 fills exactly two rows; the audit timeline is taller,
// so 4 entries is already a full card.
const DISCUSSIONS_PAGE_SIZE = 3;
const CANDIDATES_PAGE_SIZE = 4;
const AUDIT_PAGE_SIZE = 4;

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
  const { t, te, formatDateTime } = useI18n();
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [decisionId, setDecisionId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingDecision, setEditingDecision] = useState(false);
  const [decisionDraft, setDecisionDraft] = useState({});
  const [updatingDecision, setUpdatingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  // Bumped after every mutation so the paginated lists re-fetch without
  // losing the page the user is standing on.
  const [refreshTick, setRefreshTick] = useState(0);

  // Which section is on screen. Driven by the URL hash so a reload, a
  // bookmark and the back button all land on the same section.
  const [view, setView] = useState(() => readView(window.location.hash));
  const activeProjectIdRef = useRef(null);
  const dashboardRequestRef = useRef(0);

  const projectId = project?.id ?? null;

  // Unapproved decision points stay in the Decisions view; approved
  // ones (the supervisor's choice) move to the execution group.
  const visibleDecisions = decisions.filter(
    (decision) =>
      decision.teacher_status !== "APPROVED" &&
      decision.teacher_status !== "REJECTED"
  );

  // Project-scoped display numbers: chains are 1..N, chain nodes are
  // "#chain-node", standalone decisions 1..M — restarted per project.
  const { decisionNumber, chainLocal } = buildDecisionNumbers(decisions);

  const sortedVisibleDecisions = [...visibleDecisions].sort(
    (first, second) => {
      const firstChained = first.chain_id != null;
      const secondChained = second.chain_id != null;

      if (firstChained !== secondChained) {
        return firstChained ? -1 : 1;
      }

      if (firstChained) {
        const firstLocal = chainLocal.get(first.chain_id) ?? 999;
        const secondLocal = chainLocal.get(second.chain_id) ?? 999;

        if (firstLocal !== secondLocal) {
          return firstLocal - secondLocal;
        }

        return (first.created_at ?? "") > (second.created_at ?? "")
          ? 1
          : -1;
      }

      return first.id - second.id;
    }
  );

  const visibleDecision =
    visibleDecisions.find((item) => item.id === decisionId) ?? null;

  function supervisorStatusLabel(decision) {
    if (decision.teacher_status === "PENDING") {
      return t("chains.statusPending");
    }

    if (decision.teacher_status === "APPROVED") {
      return t("chains.status.APPROVED");
    }

    if (decision.teacher_status === "HELD") {
      return t("chains.status.HELD");
    }

    if (decision.teacher_status === "REJECTED") {
      return t("chains.status.REJECTED");
    }

    if (decision.chain_id == null) {
      return t("decisions.noChain");
    }

    return t("chains.statusDraft");
  }

  // When the selected decision is no longer visible (its chain got
  // approved and it moved to the execution group), fall back to the
  // first visible one.
  useEffect(() => {
    if (
      visibleDecisions.length > 0 &&
      !visibleDecisions.some((item) => item.id === decisionId)
    ) {
      setDecisionId(visibleDecisions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDecisions.length, decisionId]);

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

  const decisionHistory = usePagedList(
    decisionId != null
      ? `${API_URL}/decisions/${decisionId}/history`
      : null,
    AUDIT_PAGE_SIZE,
    refreshTick
  );

  async function loadDashboard(keepSelected = null, preferProjectId = null) {
    const requestId = ++dashboardRequestRef.current;

    try {
      const projectsResponse = await fetch(`${API_URL}/projects`);

      if (!projectsResponse.ok) {
        throw new Error("Failed to load projects");
      }

      const projects = await projectsResponse.json();

      if (requestId !== dashboardRequestRef.current) {
        return false;
      }

      // Cleared only after an await: setting state synchronously inside
      // the effect body triggers a cascading render
      // (react-hooks/set-state-in-effect).
      setError("");
      setProjects(projects);

      if (projects.length === 0) {
        activeProjectIdRef.current = null;
        setProject(null);
        setError(t("app.noProjects"));
        return false;
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

      const decisionsResponse = await fetch(
        `${API_URL}/decisions?project_id=${activeProject.id}`
      );

      if (!decisionsResponse.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const decisionsData = await decisionsResponse.json();

      if (requestId !== dashboardRequestRef.current) {
        return false;
      }

      activeProjectIdRef.current = activeProject.id;
      setProject(activeProject);
      setDecisions(decisionsData);
      setDecisionId((previous) =>
        decisionsData.some((item) => item.id === previous)
          ? previous
          : decisionsData[0]?.id ?? null
      );
      return true;
    } catch (err) {
      if (requestId === dashboardRequestRef.current) {
        setError(te(err.message));
      }
    } finally {
      if (requestId === dashboardRequestRef.current) {
        setLoading(false);
      }
    }

    return false;
  }

  // Reload everything after a write. `loadDashboard` alone would leave
  // the paginated lists showing pre-write data.
  async function reloadData(keepSelected = null, preferProjectId = null) {
    const refreshed = await loadDashboard(keepSelected, preferProjectId);

    if (refreshed) {
      setRefreshTick((tick) => tick + 1);
    }

    return refreshed;
  }

  function selectProject(nextProject) {
    window.localStorage.setItem(
      "decisiontrace.activeProjectId",
      String(nextProject.id)
    );
    activeProjectIdRef.current = nextProject.id;
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
    activeProjectIdRef.current = created.id;
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
      activeProjectIdRef.current = null;
      setProject(null);
      await loadDashboard();
    } else {
      await loadDashboard(null, project?.id ?? null);
    }
  }

  async function createRecord(path, payload, errorKey) {
    if (project?.id == null) {
      throw new Error(t("recordForm.chooseProject"));
    }

    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, project_id: project.id }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        typeof data.detail === "string" ? data.detail : t(errorKey)
      );
    }

    return response.json();
  }

  async function createDecision(payload) {
    const created = await createRecord(
      "/decisions", payload, "recordForm.decisionFailed"
    );

    if (activeProjectIdRef.current === created.project_id) {
      const refreshed = await reloadData(null, created.project_id);

      if (refreshed && activeProjectIdRef.current === created.project_id) {
        setDecisionId(created.id);
        setEditingDecision(false);
      }
    }

    return created;
  }

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
    async function handleHashChange() {
      setView(readView(window.location.hash));

      // A section swap is a page change: land at the top, not halfway
      // down a section the user has not seen yet.
      window.scrollTo(0, 0);

      // Decisions change elsewhere (the supervisor approving a node
      // overrules the chain's other points), so refresh the list when
      // a view is (re)entered.
      try {
        const response = await fetch(
          `${API_URL}/decisions?project_id=${projectId}`
        );

        if (response.ok) {
          setDecisions(await response.json());
        }
      } catch {
        // Keep the stale list on network trouble.
      }
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [projectId]);

  function startDecisionEdit() {
    const decision =
      decisions.find((item) => item.id === decisionId) ??
      decisions[0] ??
      null;

    if (!decision) {
      return;
    }

    setDecisionDraft({
      title: decision.title,
      rationale: decision.rationale ?? "",
      status: decision.status,
      reason: "",
      decidedBy: decision.decided_by ?? "",
    });
    setDecisionError("");
    setEditingDecision(true);
  }

  async function saveDecision() {
    const decision =
      decisions.find((item) => item.id === decisionId) ??
      decisions[0] ??
      null;

    if (!decision) {
      return;
    }

    if (!decisionDraft.title?.trim()) {
      setDecisionError(t("decisions.titleRequired"));
      return;
    }

    // A decision keeps its recorded goal: the rationale may change, but
    // it cannot be erased (mirrors the backend rule on PATCH).
    const draftRationale = decisionDraft.rationale ?? "";
    const currentRationale = decision.rationale ?? "";

    if (
      draftRationale !== currentRationale &&
      !draftRationale.trim()
    ) {
      setDecisionError(t("decisions.rationaleRequired"));
      return;
    }

    // Send only the fields that actually changed.
    const body = {};

    if (decisionDraft.title !== decision.title) {
      body.title = decisionDraft.title;
    }

    if (draftRationale !== currentRationale) {
      body.rationale = draftRationale;
    }

    if (decisionDraft.status !== decision.status) {
      body.status = decisionDraft.status;
    }

    // The decision maker may be set, changed, or cleared explicitly.
    if (
      (decisionDraft.decidedBy ?? "").trim() !==
      (decision.decided_by ?? "")
    ) {
      body.decided_by = decisionDraft.decidedBy.trim() || null;
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

      await reloadData();
    } catch (err) {
      setDecisionError(te(err.message) || t("decisions.failedUpdate"));
    } finally {
      setUpdatingDecision(false);
    }
  }

  if (loading) {
    return <div className="message">{t("app.loading")}</div>;
  }

  const pendingTotal = pendingCandidates.total;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="brand">{t("app.brand")}</div>
            <div className="brand-subtitle">{t("app.tagline")}</div>
          </div>

          <div className="topbar-right">
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

      <Sidebar active={view} counts={{ intake: pendingTotal }} />

      <main className="dashboard">
        {error && (
          <div className="message error" role="alert">
            {t("app.error", { message: error })}
          </div>
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
          <DecisionCreateForm
            key={projectId}
            projectId={projectId}
            onCreate={createDecision}
          />
        )}

        {view === "chains" && (
          <ChainPanel
            projectId={projectId}
            decisions={decisions}
          />
        )}

        {view === "teacher-awaiting" && (
          <TeacherDashboard section="awaiting" />
        )}

        {view === "teacher-progress" && (
          <TeacherDashboard section="progress" />
        )}

        {view === "execute-decisions" && (
          <ExecuteDecisions decisions={decisions} />
        )}

        {view === "execute-tasks" && (
          <ExecutePanel projectId={projectId} section="tasks" />
        )}

        {view === "execute-graph" && (
          <ExecutePanel projectId={projectId} section="graph" />
        )}

        {view === "execute-problems" && (
          <ExecutePanel projectId={projectId} section="problems" />
        )}

        {view === "decisions" && (
          <section className="card chain-list-card">
            <p className="eyebrow">{t("decisions.eyebrow")}</p>
            <h2>{t("decisions.unapprovedTable")}</h2>

            {sortedVisibleDecisions.length === 0 ? (
              <p className="muted">{t("decisions.noUnapproved")}</p>
            ) : (
              <ul className="stakeholder-list">
                {sortedVisibleDecisions.map((item) => (
                  <li
                    className={`stakeholder-row ${
                      item.id === visibleDecision?.id ? "is-selected" : ""
                    }`}
                    key={item.id}
                    onClick={() => setDecisionId(item.id)}
                  >
                    <span className="chain-status-chip">
                      {supervisorStatusLabel(item)}
                    </span>

                    <span>
                      {decisionNumber(item)} {item.title}
                    </span>

                    {item.decided_by && (
                      <span className="chain-node-maker">
                        <span
                          className="person-dot"
                          style={{
                            background: personColor(item.decided_by),
                          }}
                          aria-hidden="true"
                        />
                        {item.decided_by}
                      </span>
                    )}

                    {item.rationale && (
                      <span className="stakeholder-maker">
                        {item.rationale}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {view === "decisions" && (
          <div className="dashboard-grid">
            <section className="card decision-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">{t("decisions.cardEyebrow")}</p>

                  <div className="decision-title-row">
                    <h2>{visibleDecision?.title || t("decisions.none")}</h2>

                    {visibleDecisions.length > 1 && (
                      <select
                        className="decision-select"
                        value={decisionId ?? ""}
                        disabled={editingDecision}
                        onChange={(event) =>
                          setDecisionId(Number(event.target.value))
                        }
                      >
                        {visibleDecisions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {decisionNumber(item)} {item.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="decision-header-actions">
                  {visibleDecision && (
                    <span className="chain-status-chip">
                      {supervisorStatusLabel(visibleDecision)}
                    </span>
                  )}

                  {visibleDecision && !editingDecision && (
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

                  <input
                    type="text"
                    placeholder={t("decisions.decidedByPlaceholder")}
                    value={decisionDraft.decidedBy ?? ""}
                    onChange={(event) =>
                      setDecisionDraft({
                        ...decisionDraft,
                        decidedBy: event.target.value,
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
                    <p>
                      {visibleDecision?.rationale ||
                        t("decisions.noRationale")}
                    </p>
                  </div>

                  <div className="trace-source">
                    {t("decisions.sourceDiscussion", {
                      id: visibleDecision?.source_discussion_id ?? "—",
                    })}
                  </div>

                  <div className="decided-by">
                    {visibleDecision?.decided_by
                      ? t("decisions.decidedBy", {
                          name: visibleDecision.decided_by,
                        })
                      : t("decisions.decidedByTeam")}
                  </div>
                </>
              )}

              {visibleDecision && (
                <>
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
          </div>
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
              projectId={projectId}
              pending={pendingCandidates}
              reviewed={reviewedCandidates}
              reload={reloadData}
              refreshKey={refreshTick}
            />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
