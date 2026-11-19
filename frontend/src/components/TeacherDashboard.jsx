import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { personColor } from "../personColors";
import ExecutionBoard from "./ExecutionBoard.jsx";

const API_URL = "http://127.0.0.1:8000";

/**
 * The supervisor's side.
 *
 * Awaiting decision: every submitted chain rendered INLINE — the whole
 * chain (all decision nodes, the discussion under each, the
 * annotations), not just its title. The supervisor may annotate ANY
 * decision node of the chain, with or without a verdict.
 *
 * In progress: a selector over the approved chains with their
 * read-only execution boards.
 */
export default function TeacherDashboard({ section = "awaiting" }) {
  const { t, te, formatDateTime } = useI18n();

  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [busyNode, setBusyNode] = useState(null);
  const [notes, setNotes] = useState({});  // keyed by decision node id
  const [progressDecisionId, setProgressDecisionId] = useState(null);

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

        const chains = await chainsResponse.json();

        // Fetch the full detail of every awaiting chain so the whole
        // chain renders inline.
        const withDetails = [];

        for (const chain of chains) {
          const detailResponse = await fetch(
            `${API_URL}/chains/${chain.id}`
          );

          withDetails.push({
            ...chain,
            detail: detailResponse.ok ? await detailResponse.json() : null,
          });
        }

        entries.push({ project, chains: withDetails });
      }

      setGroups(entries);
      setProgressDecisionId((current) => {
        const decisionIds = entries.flatMap(({ chains }) =>
          chains
            .filter((chain) => chain.teacher_status === "APPROVED")
            .flatMap((chain) =>
              (chain.detail?.nodes ?? [])
                .filter((node) => node.teacher_status === "APPROVED")
                .map((node) => node.id)
            )
        );
        return decisionIds.includes(current)
          ? current
          : decisionIds[0] ?? null;
      });
    } catch (err) {
      setError(te(err.message) || t("teacher.loadFailed"));
    }
  }

  useEffect(() => {
    loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(chain, node, status) {
    setBusyNode(node.id);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/chains/${chain.id}/teacher-action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            note: (notes[node.id] || "").trim() || null,
            decision_id: node.id,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("teacher.loadFailed"));
      }

      setNotes((current) => ({ ...current, [node.id]: "" }));
      await loadGroups();
    } catch (err) {
      setError(te(err.message) || t("teacher.loadFailed"));
    } finally {
      setBusyNode(null);
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

  function annotationRow(annotation) {
    return (
      <div className="annotation-row" key={annotation.id}>
        <span className="annotation-time">
          {formatDateTime(annotation.created_at)}
        </span>
        <p>{annotation.text}</p>
      </div>
    );
  }

  function reviewBlock(project, chain, groupChains) {
    const detail = chain.detail;

    return (
      <div className="teacher-chain-review" key={chain.id}>
        <div className="teacher-group-head">
          <h3>
            {(() => {
              const sorted = [...groupChains].sort((a, b) =>
                (a.created_at ?? "") > (b.created_at ?? "") ? 1 : -1
              );
              const index = sorted.findIndex(
                (entry) => entry.id === chain.id
              );
              return `#${index + 1} ${chain.title}`;
            })()}
          </h3>
          <span className="chain-status-chip">{statusLabel(chain)}</span>
        </div>

        {detail &&
          detail.nodes.map((node, index) => (
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

                {node.teacher_status && (
                  <span className="chain-status-chip">
                    {t(
                      `chains.status.${node.teacher_status}`,
                      {},
                      node.teacher_status.toLowerCase()
                    )}
                  </span>
                )}

              </div>

              <p className="chain-node-title">{node.title}</p>

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

              {detail.annotations
                .filter(
                  (annotation) => annotation.decision_id === node.id
                )
                .map(annotationRow)}

              <div className="teacher-action-bar">
                <input
                  type="text"
                  placeholder={t("teacher.notePlaceholder")}
                  value={notes[node.id] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [node.id]: event.target.value,
                    }))
                  }
                />

                <button
                  type="button"
                  className="secondary-button"
                  disabled={busyNode === node.id}
                  onClick={() => act(chain, node, null)}
                >
                  {t("teacher.annotateOnly")}
                </button>

                <button
                  type="button"
                  className="primary-button"
                  disabled={busyNode === node.id}
                  onClick={() => act(chain, node, "APPROVED")}
                >
                  {t("teacher.approve")}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={busyNode === node.id}
                  onClick={() => act(chain, node, "HELD")}
                >
                  {t("teacher.hold")}
                </button>

                <button
                  type="button"
                  className="secondary-button reject-button"
                  disabled={busyNode === node.id}
                  onClick={() => act(chain, node, "REJECTED")}
                >
                  {t("teacher.reject")}
                </button>
              </div>
            </div>
          ))}

        {detail &&
          detail.annotations.filter(
            (annotation) => annotation.decision_id == null
          ).length > 0 && (
            <div className="chain-annotations">
              <p className="eyebrow">{t("teacher.annotations")}</p>
              {detail.annotations
                .filter((annotation) => annotation.decision_id == null)
                .map(annotationRow)}
            </div>
          )}

      </div>
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
          const awaiting = chains.filter(
            (chain) => chain.teacher_status !== "APPROVED"
          );
          const approved = chains.filter(
            (chain) => chain.teacher_status === "APPROVED"
          );

          if (section === "progress") {
            const progressOptions = [];

            for (const chain of approved) {
              for (const node of chain.detail?.nodes ?? []) {
                if (node.teacher_status !== "APPROVED") {
                  continue;
                }
                progressOptions.push({
                  decisionId: node.id,
                  title: node.title,
                  chainId: chain.id,
                });
              }
            }

            return (
              <div className="teacher-group" key={project.id}>
                <div className="teacher-group-head">
                  <h3>{project.name}</h3>
                </div>

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
                          value={progressDecisionId ?? ""}
                          aria-label={t("execute.pickDecision")}
                          onChange={(event) =>
                            setProgressDecisionId(
                              Number(event.target.value)
                            )
                          }
                        >
                          {progressOptions.map((option) => (
                            <option
                              key={option.decisionId}
                              value={option.decisionId}
                            >
                              {option.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {progressDecisionId != null && (
                        <ExecutionBoard
                          chainId={
                            progressOptions.find(
                              (option) =>
                                option.decisionId === progressDecisionId
                            )?.chainId ?? null
                          }
                          decisionId={progressDecisionId}
                          readOnly
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div className="teacher-group" key={project.id}>
              <div className="teacher-group-head">
                <h3>{project.name}</h3>
              </div>

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
                  awaiting.map((chain) =>
                    reviewBlock(project, chain, chains)
                  )
                )}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
