import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { personColor } from "../personColors";

const API_URL = "http://127.0.0.1:8000";

/**
 * The decision chains: one topic's decision evolution, discussed
 * chat-style under the latest node, extended by appending nodes, and
 * submitted to the supervisor when mature. This is the student-side
 * core of the repositioned system.
 */
export default function ChainPanel({ projectId, decisions }) {
  const { t, te, formatDateTime } = useI18n();

  const [chains, setChains] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [newChainDecision, setNewChainDecision] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeRationale, setNodeRationale] = useState("");
  const [nodeMaker, setNodeMaker] = useState("");

  async function reload(chainId) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/chains${projectId ? `?project_id=${projectId}` : ""}`
      );

      if (!response.ok) {
        throw new Error(t("chains.loadFailed"));
      }

      const data = await response.json();
      setChains(data);

      if (chainId != null) {
        const detailResponse = await fetch(`${API_URL}/chains/${chainId}`);

        if (!detailResponse.ok) {
          throw new Error(t("chains.loadFailed"));
        }

        setDetail(await detailResponse.json());
      }
    } catch (err) {
      setError(te(err.message) || t("chains.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!projectId) {
      return;
    }

    reload(null);
    setDetail(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function createChain() {
    if (!newChainDecision) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/chains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          decision_id: Number(newChainDecision),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("chains.loadFailed"));
      }

      const chain = await response.json();
      setNewChainDecision("");
      await reload(chain.id);
    } catch (err) {
      setError(te(err.message) || t("chains.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function post(chainId, path, body, success) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/chains/${chainId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("chains.loadFailed"));
      }

      success();
      await reload(chainId);
    } catch (err) {
      setError(te(err.message) || t("chains.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function addComment() {
    if (!detail || !commentText.trim()) {
      return;
    }

    post(
      detail.id,
      "comments",
      {
        author: commentAuthor.trim() || null,
        text: commentText.trim(),
      },
      () => {
        setCommentText("");
      }
    );
  }

  function appendNode() {
    if (!detail || !nodeTitle.trim()) {
      return;
    }

    post(
      detail.id,
      "nodes",
      {
        title: nodeTitle.trim(),
        rationale: nodeRationale.trim() || null,
        decided_by: nodeMaker.trim() || null,
      },
      () => {
        setNodeTitle("");
        setNodeRationale("");
        setNodeMaker("");
      }
    );
  }

  function submitChain() {
    if (!detail) {
      return;
    }

    post(detail.id, "submit", {}, () => {});
  }

  function statusLabel(chain) {
    if (chain.teacher_status === "PENDING") {
      return t("chains.statusPending");
    }
    if (chain.teacher_status) {
      return t(`chains.status.${chain.teacher_status}`, {},
        chain.teacher_status.toLowerCase());
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

  function nodeRow(node, index) {
    return (
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
    );
  }

  if (detail) {
    const generalComments = detail.comments.filter(
      (comment) => comment.decision_id == null
    );

    return (
      <section className="card chain-detail-card">
        <div className="chain-detail-head">
          <div>
            <p className="eyebrow">{t("chains.eyebrow")}</p>
            <h2>{detail.title}</h2>
            <span className="chain-status-chip">
              {statusLabel(detail)}
            </span>
          </div>

          <div className="chain-head-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setDetail(null)}
            >
              {t("chains.back")}
            </button>

            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={submitChain}
            >
              {t("chains.submit")}
            </button>
          </div>
        </div>

        {error && <p className="pipeline-error">{te(error)}</p>}

        <div className="chain-nodes">
          {detail.nodes.map(nodeRow)}
        </div>

        {generalComments.length > 0 && (
          <div className="chain-general-comments">
            {generalComments.map((comment) => (
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
        )}

        <div className="chain-comment-form">
          <input
            type="text"
            className="chain-author-input"
            placeholder={t("chains.commentAuthor")}
            value={commentAuthor}
            onChange={(event) => setCommentAuthor(event.target.value)}
          />

          <input
            type="text"
            className="chain-comment-input"
            placeholder={t("chains.commentPlaceholder")}
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
          />

          <button
            type="button"
            className="primary-button"
            disabled={busy || !commentText.trim()}
            onClick={addComment}
          >
            {t("chains.send")}
          </button>
        </div>

        <div className="chain-node-form">
          <p className="eyebrow">{t("chains.appendNode")}</p>

          <input
            type="text"
            placeholder={t("chains.nodeTitlePlaceholder")}
            value={nodeTitle}
            onChange={(event) => setNodeTitle(event.target.value)}
          />

          <input
            type="text"
            placeholder={t("chains.nodeRationalePlaceholder")}
            value={nodeRationale}
            onChange={(event) => setNodeRationale(event.target.value)}
          />

          <input
            type="text"
            placeholder={t("chains.nodeMakerPlaceholder")}
            value={nodeMaker}
            onChange={(event) => setNodeMaker(event.target.value)}
          />

          <button
            type="button"
            className="primary-button"
            disabled={busy || !nodeTitle.trim()}
            onClick={appendNode}
          >
            {t("chains.append")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card chain-list-card">
      <p className="eyebrow">{t("chains.eyebrow")}</p>
      <h2>{t("chains.title")}</h2>
      <p className="muted">{t("chains.subtitle")}</p>

      {error && <p className="pipeline-error">{te(error)}</p>}

      <div className="chain-create">
        <select
          value={newChainDecision}
          aria-label={t("chains.pickDecision")}
          onChange={(event) => setNewChainDecision(event.target.value)}
        >
          <option value="">{t("chains.pickDecision")}</option>
          {decisions
            .filter((decision) => decision.chain_id == null)
            .map((decision) => (
              <option key={decision.id} value={decision.id}>
                #{decision.id} {decision.title}
              </option>
            ))}
        </select>

        <button
          type="button"
          className="primary-button"
          disabled={busy || !newChainDecision}
          onClick={createChain}
        >
          {t("chains.new")}
        </button>
      </div>

      {chains.length === 0 ? (
        <p className="muted">{t("chains.none")}</p>
      ) : (
        <div className="chain-grid">
          {chains.map((chain) => (
            <article
              className="chain-card"
              key={chain.id}
              onClick={() => reload(chain.id)}
            >
              <div className="chain-card-head">
                <h3>#{chain.id} {chain.title}</h3>
                <span className="chain-status-chip">
                  {statusLabel(chain)}
                </span>
              </div>

              <p className="chain-card-meta">
                {t("chains.nodeCount", { count: chain.node_count })}
                {" · "}
                {t("chains.commentCount", { count: chain.comment_count })}
              </p>

              {chain.submitted_at && (
                <p className="chain-card-meta">
                  {t("chains.submittedAt", {
                    date: formatDateTime(chain.submitted_at),
                  })}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
