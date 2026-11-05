import { useI18n } from "../i18n";
import StatusBadge from "./StatusBadge.jsx";

const NODE_FIELDS = ["status", "due_date", "owner", "description"];

function displayValue(field, value, t, formatDate) {
  if (value == null || value === "") {
    return t("common.notSet");
  }

  if (field === "status") {
    return t(`status.${value}`, {}, value);
  }

  if (field === "due_date") {
    return formatDate(value);
  }

  return String(value);
}

function DiffStat({ tone, value, label }) {
  const isZero = String(value).replace(/[^\d]/g, "") === "0";

  return (
    <span className={`diff-stat diff-stat-${tone}${isZero ? " is-zero" : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}

function DiffNode({ node }) {
  const { t, formatDate } = useI18n();

  return (
    <li className="diff-node">
      <div className="diff-node-head">
        <strong>{node.owner}</strong>
        <span className="diff-node-id">#{node.id}</span>
        <StatusBadge status={node.status} />
      </div>

      {node.description && (
        <p className="diff-node-description">{node.description}</p>
      )}

      <span className="diff-node-meta">
        {node.due_date
          ? t("dependencies.diffDue", {
              date: formatDate(node.due_date),
            })
          : t("dependencies.diffNoDue")}
      </span>
    </li>
  );
}

function ChangedNode({ item }) {
  const { t, formatDate } = useI18n();

  return (
    <li className="diff-node">
      <div className="diff-node-head">
        <strong>{item.after.owner}</strong>
        <span className="diff-node-id">#{item.id}</span>
        <StatusBadge status={item.after.status} />
      </div>

      <ul className="diff-field-list">
        {NODE_FIELDS.filter((field) => item.changes[field]).map((field) => {
          const change = item.changes[field];

          return (
            <li className="diff-field" key={field}>
              <span className="diff-field-name">
                {t(`dependencies.diffField.${field}`)}
              </span>

              <span className="diff-field-values">
                <span className="diff-before">
                  {displayValue(field, change.from, t, formatDate)}
                </span>
                <span className="diff-arrow" aria-hidden="true">
                  →
                </span>
                <span className="diff-after">
                  {displayValue(field, change.to, t, formatDate)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function EdgeList({ edges }) {
  const { t } = useI18n();

  return (
    <ul className="diff-edge-list">
      {edges.map((edge, index) => (
        <li
          className="diff-edge"
          key={`${edge.predecessor_commitment_id}-${edge.successor_commitment_id}-${edge.dependency_type}-${index}`}
        >
          <strong>{edge.predecessor_owner}</strong>
          <span className="diff-arrow" aria-hidden="true">
            →
          </span>
          <strong>{edge.successor_owner}</strong>
          <span className="type-badge">
            {t(`type.${edge.dependency_type}`, {}, edge.dependency_type)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function buildMarkdown(diff, t) {
  const { summary, nodes, edges, topology, analysis } = diff;
  const markdownValue = (field, value) => {
    if (value == null || value === "") {
      return t("common.notSet");
    }

    if (field === "status") {
      return t(`status.${value}`, {}, value);
    }

    return String(value);
  };

  const lines = [
    `# ${t("dependencies.diffMarkdownTitle")}`,
    "",
    `**${diff.from_snapshot.title}** → **${diff.to_snapshot.title}**`,
    "",
    `## ${t("dependencies.diffSummary")}`,
    "",
    `- ${t("dependencies.diffCommitments")}: +${summary.nodes_added} / -${summary.nodes_removed} / ~${summary.nodes_changed}`,
    `- ${t("dependencies.diffDependencies")}: +${summary.edges_added} / -${summary.edges_removed}`,
    `- ${t("dependencies.diffTopology")}: ${t("dependencies.diffMoved")} ${summary.topology_moved}`,
    `- ${t("dependencies.diffPlanState")}: ${summary.analysis_changed}`,
    "",
  ];

  function appendNodes(title, list) {
    if (list.length === 0) {
      return;
    }

    lines.push(`## ${title}`, "");

    for (const node of list) {
      lines.push(
        `- **${node.owner}** #${node.id} — ${node.description || t("common.notSet")} (${t(`status.${node.status}`, {}, node.status)}, ${node.due_date || t("dependencies.diffNoDue")})`
      );
    }

    lines.push("");
  }

  appendNodes(t("dependencies.diffAddedCommitments"), nodes.added);
  appendNodes(t("dependencies.diffRemovedCommitments"), nodes.removed);

  if (nodes.changed.length > 0) {
    lines.push(`## ${t("dependencies.diffChangedCommitments")}`, "");

    for (const item of nodes.changed) {
      const changes = NODE_FIELDS.filter((field) => item.changes[field])
        .map((field) => {
          const change = item.changes[field];
          return `${t(`dependencies.diffField.${field}`)}: ${markdownValue(field, change.from)} → ${markdownValue(field, change.to)}`;
        })
        .join("; ");

      lines.push(`- **${item.after.owner}** #${item.id} — ${changes}`);
    }

    lines.push("");
  }

  if (edges.added.length > 0 || edges.removed.length > 0) {
    lines.push(`## ${t("dependencies.diffDependencies")}`, "");

    for (const edge of edges.added) {
      lines.push(
        `- + ${edge.predecessor_owner} → ${edge.successor_owner} (${t(`type.${edge.dependency_type}`, {}, edge.dependency_type)})`
      );
    }

    for (const edge of edges.removed) {
      lines.push(
        `- - ${edge.predecessor_owner} → ${edge.successor_owner} (${t(`type.${edge.dependency_type}`, {}, edge.dependency_type)})`
      );
    }

    lines.push("");
  }

  if (topology.order_changed) {
    lines.push(`## ${t("dependencies.diffTopology")}`, "");
    lines.push(`- ${t("dependencies.diffOrderChanged")}`);

    for (const item of topology.moved) {
      lines.push(
        `- ${item.owner} #${item.id}: ${item.from_rank} → ${item.to_rank}`
      );
    }

    lines.push("");
  }

  if (analysis.changed.length > 0) {
    lines.push(`## ${t("dependencies.diffPlanState")}`, "");

    for (const item of analysis.changed) {
      lines.push(
        `- ${item.owner} #${item.commitment_id}: ${t(`status.${item.from}`, {}, item.from)} → ${t(`status.${item.to}`, {}, item.to)}`
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}

function SnapshotDiff({ diff }) {
  const { t } = useI18n();
  const { summary, nodes, edges, topology, analysis } = diff;

  function downloadMarkdown() {
    const markdown = buildMarkdown(diff, t);
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `snapshot-diff-${diff.from_snapshot.id}-${diff.to_snapshot.id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const hasNodeChanges =
    nodes.added.length > 0 ||
    nodes.removed.length > 0 ||
    nodes.changed.length > 0;

  const hasEdgeChanges =
    edges.added.length > 0 || edges.removed.length > 0;

  return (
    <div className="snapshot-diff">
      <div className="snapshot-diff-head">
        <div>
          <p className="eyebrow">{t("dependencies.compareResultEyebrow")}</p>
          <h3>
            {t("dependencies.compareHeading", {
              from: diff.from_snapshot.title,
              to: diff.to_snapshot.title,
            })}
          </h3>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={downloadMarkdown}
        >
          {t("dependencies.diffExport")}
        </button>
      </div>

      {!summary.has_changes ? (
        <div className="snapshot-diff-empty">
          <strong>{t("dependencies.compareEmpty")}</strong>
          <p className="muted">{t("dependencies.compareEmptyHint")}</p>
        </div>
      ) : (
        <>
          <div
            className="diff-summary"
            role="group"
            aria-label={t("dependencies.diffSummary")}
          >
            <div className="diff-summary-group">
              <span className="diff-summary-title">
                {t("dependencies.diffCommitments")}
              </span>
              <DiffStat
                tone="added"
                value={`+${summary.nodes_added}`}
                label={t("dependencies.diffAdded")}
              />
              <DiffStat
                tone="removed"
                value={`−${summary.nodes_removed}`}
                label={t("dependencies.diffRemoved")}
              />
              <DiffStat
                tone="changed"
                value={`~${summary.nodes_changed}`}
                label={t("dependencies.diffChanged")}
              />
            </div>

            <div className="diff-summary-group">
              <span className="diff-summary-title">
                {t("dependencies.diffDependencies")}
              </span>
              <DiffStat
                tone="added"
                value={`+${summary.edges_added}`}
                label={t("dependencies.diffAdded")}
              />
              <DiffStat
                tone="removed"
                value={`−${summary.edges_removed}`}
                label={t("dependencies.diffRemoved")}
              />
            </div>

            <div className="diff-summary-group">
              <span className="diff-summary-title">
                {t("dependencies.diffTopology")}
              </span>
              <span
                className={`diff-order-pill ${
                  summary.topology_order_changed ? "is-changed" : ""
                }`}
              >
                {summary.topology_order_changed
                  ? t("dependencies.diffOrderChanged")
                  : t("dependencies.diffOrderUnchanged")}
              </span>
              <DiffStat
                tone="changed"
                value={summary.topology_moved}
                label={t("dependencies.diffMoved")}
              />
            </div>

            <div className="diff-summary-group">
              <span className="diff-summary-title">
                {t("dependencies.diffPlanState")}
              </span>
              <DiffStat
                tone="changed"
                value={summary.analysis_changed}
                label={t("dependencies.diffStateChanges")}
              />
            </div>
          </div>

          <div className="diff-sections">
            <section className="diff-section">
              <h4>{t("dependencies.diffCommitments")}</h4>

              {!hasNodeChanges ? (
                <p className="diff-none">
                  {t("dependencies.diffNoCommitmentChanges")}
                </p>
              ) : (
                <>
                  {nodes.added.length > 0 && (
                    <div className="diff-group">
                      <span className="diff-group-title is-added">
                        + {t("dependencies.diffAddedCommitments")}
                      </span>
                      <ul className="diff-node-list">
                        {nodes.added.map((node) => (
                          <DiffNode node={node} key={node.id} />
                        ))}
                      </ul>
                    </div>
                  )}

                  {nodes.removed.length > 0 && (
                    <div className="diff-group">
                      <span className="diff-group-title is-removed">
                        − {t("dependencies.diffRemovedCommitments")}
                      </span>
                      <ul className="diff-node-list">
                        {nodes.removed.map((node) => (
                          <DiffNode node={node} key={node.id} />
                        ))}
                      </ul>
                    </div>
                  )}

                  {nodes.changed.length > 0 && (
                    <div className="diff-group">
                      <span className="diff-group-title is-changed">
                        ~ {t("dependencies.diffChangedCommitments")}
                      </span>
                      <ul className="diff-node-list">
                        {nodes.changed.map((item) => (
                          <ChangedNode item={item} key={item.id} />
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="diff-section">
              <h4>{t("dependencies.diffDependencies")}</h4>

              {!hasEdgeChanges ? (
                <p className="diff-none">
                  {t("dependencies.diffNoDependencyChanges")}
                </p>
              ) : (
                <>
                  {edges.added.length > 0 && (
                    <div className="diff-group">
                      <span className="diff-group-title is-added">
                        + {t("dependencies.diffAddedDependencies")}
                      </span>
                      <EdgeList edges={edges.added} />
                    </div>
                  )}

                  {edges.removed.length > 0 && (
                    <div className="diff-group">
                      <span className="diff-group-title is-removed">
                        − {t("dependencies.diffRemovedDependencies")}
                      </span>
                      <EdgeList edges={edges.removed} />
                    </div>
                  )}
                </>
              )}
            </section>

            {topology.order_changed && (
              <section className="diff-section">
                <h4>{t("dependencies.diffTopology")}</h4>

                {topology.moved.length > 0 ? (
                  <ul className="diff-move-list">
                    {topology.moved.map((item) => (
                      <li key={item.id}>
                        <span>
                          {item.owner} #{item.id}
                        </span>
                        <span className="diff-move-rank">
                          {item.from_rank}
                          <span aria-hidden="true"> → </span>
                          {item.to_rank}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="diff-none">
                    {t("dependencies.diffOrderShifted")}
                  </p>
                )}
              </section>
            )}

            {analysis.changed.length > 0 && (
              <section className="diff-section">
                <h4>{t("dependencies.diffPlanState")}</h4>

                <ul className="diff-state-list">
                  {analysis.changed.map((item) => (
                    <li key={item.commitment_id}>
                      <span>
                        {item.owner} #{item.commitment_id}
                      </span>
                      <span className="diff-state-values">
                        <span className="diff-before">
                          {t(`status.${item.from}`, {}, item.from)}
                        </span>
                        <span className="diff-arrow" aria-hidden="true">
                          →
                        </span>
                        <span className="diff-after">
                          {t(`status.${item.to}`, {}, item.to)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default SnapshotDiff;
