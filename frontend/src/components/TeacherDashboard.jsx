import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { personColor } from "../personColors";
import ExecutionBoard from "./ExecutionBoard.jsx";

const API_URL = "http://127.0.0.1:8000";

/**
 * The supervisor's side: one group card per project, listing the
 * chains the students submitted. The supervisor reads the chain
 * (decisions + discussion), annotates — with or without a verdict —
 * and decides: approve, reject, or hold. Everything flows back to the
 * student side through the chain itself.
 */
export default function TeacherDashboard({ section = "awaiting" }) {
  const { t, te, formatDateTime } = useI18n();

  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState("");
  const [progressChainId, setProgressChainId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadGroups() {
    setError("");

    try {
      const projectsResponse = await fetch(`${API_URL}/projects`);

      if (!projectsResponse.ok) {
        throw new Error(t("teacher.loadFailed"));
      }

      const projects = await projectsResponse.json();
      const entries = [];

      for (const project of projects) {
        const chainsResponse = await fetch(
          `${API_URL}/chains?project_id=${project.id}&submitted_only=true`
        );

        if (!chainsResponse.ok) {
          throw new Error(t("teacher.loadFailed"));
        }

        entries.push({
          project,
          chains: await chainsResponse.json(),
        });
      }

      setGroups(entries);
      setProgressChainId((current) => {
        const approvedIds = entries.flatMap(
          ({ chains }) =>
            chains
              .filter((chain) => chain.teacher_status === "APPROVED")
              .map((chain) => chain.id)
        );
        return approvedIds.includes(current)
          ? current
          : approvedIds[0] ?? null;
      });
    } catch (err) {
      setError(te(err.message) || t("teacher.loadFailed"));
    }
  }

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openChain(project, chainId) {
    setSelected({ project, chainId });
    setDetail(null);
    setNote("");
    setError("");

    try {
      const response = await fetch(`${API_URL}/chains/${chainId}`);

      if (!response.ok) {
        throw new Error(t("teacher.loadFailed"));
      }

      setDetail(await response.json());
    } catch (err) {
      setError(te(err.message) || t("teacher.loadFailed"));
    }
  }

  async function act(status) {
    if (!detail) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/chains/${detail.id}/teacher-action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            note: note.trim() || null,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("teacher.loadFailed"));
      }

      setNote("");
      setDetail(await response.json());
      await loadGroups();
    } catch (err) {
      setError(te(err.message) || t("teacher.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function statusLabel(chain) {
    if (chain.teacher_status === "PENDING") {
      return t("chains.statusPending");
    }
    if (chain.teacher_status) {
      return t(
        `chains.status.${chain.teacher_status}`,
        {},
        chain.teacher_status.toLowerCase()
      );
    }
    return t("chains.statusDraft");
  }

  function personDot(name) {
    return (
      <span
        className="person-dot"
        style={{ background: personColor(name) }}
        aria-hidden="true"
      />
    );
  }

  if (selected && detail) {
    return (
      <section className="card chain-detail-card">
        <div className="chain-detail-head">
          <div>
            <p className="eyebrow">{t("teacher.eyebrow")}</p>
            <h2>{detail.title}</h2>
            <p className="muted">
              {selected.project.name} ·{" "}
              <span className="chain-status-chip">
                {statusLabel(detail)}
              </span>
            </p>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSelected(null);
              setDetail(null);
            }}
          >
            {t("chains.back")}
          </button>
        </div>

        {error && <p className="pipeline-error">{te(error)}</p>}

        <div className="chain-nodes">
          {detail.nodes.map((node, index) => (
            <div className="chain-node" key={node.id}>
              <div className="chain-node-head">
                <span className="chain-node-index">
                  {t("chains.nodeIndex", { index: index + 1 })}
                </span>

                {node.decided_by && (
                  <span className="chain-node-maker">
                    {personDot(node.decided_by)}
                    {node.decided_by}
                  </span>
                )}

                <span className="chain-node-time">
                  {formatDateTime(node.created_at)}
                </span>
              </div>

              <p className="chain-node-title">
                #{node.id} {node.title}
              </p>

              {node.rationale && (
                <p className="chain-node-rationale">{node.rationale}</p>
              )}

              {detail.comments
                .filter((comment) => comment.decision_id === node.id)
                .map((comment) => (
                  <div className="chain-comment" key={comment.id}>
                    {comment.author && (
                      <strong className="chain-comment-author">
                        {comment.author}:{" "}
                      </strong>
                    )}
                    {comment.text}
                  </div>
                ))}
            </div>
          ))}
        </div>

        {detail.annotations.length > 0 && (
          <div className="chain-annotations">
            <p className="eyebrow">{t("teacher.annotations")}</p>

            {detail.annotations.map((annotation) => (
              <div className="annotation-row" key={annotation.id}>
                <span className="annotation-time">
                  {formatDateTime(annotation.created_at)}
                </span>
                <p>{annotation.text}</p>
              </div>
            ))}
          </div>
        )}

        {detail.teacher_status === "APPROVED" && (
          <div className="decision-subsection">
            <ExecutionBoard chainId={detail.id} readOnly />
          </div>
        )}

        <div className="teacher-action-bar">
          <input
            type="text"
            placeholder={t("teacher.notePlaceholder")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />

          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => act(null)}
          >
            {t("teacher.annotateOnly")}
          </button>

          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => act("APPROVED")}
          >
            {t("teacher.approve")}
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => act("HELD")}
          >
            {t("teacher.hold")}
          </button>

          <button
            type="button"
            className="secondary-button reject-button"
            disabled={busy}
            onClick={() => act("REJECTED")}
          >
            {t("teacher.reject")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card chain-list-card">
      <p className="eyebrow">{t("teacher.eyebrow")}</p>
      <h2>{t("teacher.title")}</h2>
      <p className="muted">{t("teacher.subtitle")}</p>

      {error && <p className="pipeline-error">{te(error)}</p>}

      {groups.length === 0 ? (
        <p className="muted">{t("teacher.noGroups")}</p>
      ) : (
        groups.map(({ project, chains }) => {
          const pending = chains.filter(
            (chain) => chain.teacher_status === "PENDING"
          ).length;

          return (
            <div className="teacher-group" key={project.id}>
              <div className="teacher-group-head">
                <h3>{project.name}</h3>

                <span className="chain-card-meta">
                  {t("teacher.submittedChains", { count: chains.length })}
                  {pending > 0 &&
                    ` · ${t("teacher.pending", { count: pending })}`}
                </span>
              </div>

              {(() => {
                const awaiting = chains.filter(
                  (chain) => chain.teacher_status !== "APPROVED"
                );
                const approved = chains.filter(
                  (chain) => chain.teacher_status === "APPROVED"
                );

                if (section === "progress") {
                  return (
                    <div className="decision-subsection">
                      <div className="decision-subheading">
                        <span>{t("teacher.inProgress")}</span>
                        <span className="subheading-note">
                          {approved.length}
                        </span>
                      </div>

                      {approved.length === 0 ? (
                        <p className="muted">{t("teacher.noInProgress")}</p>
                      ) : (
                        <>
                          <div className="chain-create">
                            <select
                              value={progressChainId ?? ""}
                              aria-label={t("execute.pickChain")}
                              onChange={(event) =>
                                setProgressChainId(
                                  Number(event.target.value)
                                )
                              }
                            >
                              {approved.map((chain) => (
                                <option key={chain.id} value={chain.id}>
                                  #{chain.id} {chain.title}
                                </option>
                              ))}
                            </select>
                          </div>

                          {progressChainId != null && (
                            <ExecutionBoard
                              chainId={progressChainId}
                              readOnly
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <>
                    <div className="decision-subsection">
                      <div className="decision-subheading">
                        <span>{t("teacher.awaiting")}</span>
                        <span className="subheading-note">
                          {awaiting.length}
                        </span>
                      </div>

                      {awaiting.length === 0 ? (
                        <p className="muted">{t("teacher.noAwaiting")}</p>
                      ) : (
                        <div className="chain-grid">
                          {awaiting.map((chain) => (
                            <article
                              className="chain-card"
                              key={chain.id}
                              onClick={() => openChain(project, chain.id)}
                            >
                              <div className="chain-card-head">
                                <h3>#{chain.id} {chain.title}</h3>
                                <span className="chain-status-chip">
                                  {statusLabel(chain)}
                                </span>
                              </div>

                              <p className="chain-card-meta">
                                {t("chains.nodeCount", {
                                  count: chain.node_count,
                                })}
                                {" · "}
                                {t("chains.commentCount", {
                                  count: chain.comment_count,
                                })}
                              </p>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })
      )}
    </section>
  );
}
