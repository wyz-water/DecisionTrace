import { useState } from "react";

import Pagination from "./Pagination";
import StatusBadge from "./StatusBadge";
import usePagedList from "../usePagedList";
import { useI18n } from "../i18n";

const API_URL = "http://127.0.0.1:8000";

/**
 * UC08: search decision history and source context.
 *
 * One query hits discussions, decisions, commitments and both history
 * tables; the backend ranks by how many fields a row matches and sends
 * back a snippet with the first term highlighted. Clicking a hit opens
 * the view where that record actually lives.
 */
export default function SearchPanel({
  projectId,
  onOpenDecision,
  onOpenCommitment,
  onNavigate,
}) {
  const { t, tp, te, formatDateTime } = useI18n();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const baseUrl = submitted.trim()
    ? `${API_URL}/search?q=${encodeURIComponent(submitted.trim())}` +
      `&project_id=${projectId}`
    : null;

  const {
    items,
    total,
    limit,
    offset,
    loading,
    error,
    setOffset,
  } = usePagedList(baseUrl, 10);

  function submit(event) {
    event.preventDefault();

    if (query.trim()) {
      setSubmitted(query.trim());
    }
  }

  function kindLabel(kind) {
    return t(`search.kind.${kind}`, {}, kind);
  }

  // History rows arrive as "Decision #5 · CONFIRMED → SUPERSEDED".
  // Rebuild that label so the statuses follow the selected language.
  function resultTitle(item) {
    if (!item.kind.endsWith("history")) {
      return item.title;
    }

    const history = /^(Decision|Commitment) #(\d+) · (\w+) → (\w+)$/.exec(
      item.title
    );

    if (!history) {
      return item.title;
    }

    const [, noun, id, oldStatus, newStatus] = history;
    const key =
      noun === "Decision"
        ? "search.decisionHistoryTitle"
        : "search.commitmentHistoryTitle";

    return t(key, {
      id,
      old: t(`status.${oldStatus}`, {}, oldStatus),
      new: t(`status.${newStatus}`, {}, newStatus),
    });
  }

  function openResult(item) {
    switch (item.kind) {
      case "decision":
      case "decision_history":
        onOpenDecision(item.decision_id);
        onNavigate("decisions");
        break;
      case "commitment":
        onOpenCommitment(item.commitment_id);
        onNavigate("plan");
        break;
      case "commitment_history":
        onOpenCommitment(item.commitment_id);
        onNavigate("audit");
        break;
      case "discussion":
      default:
        onNavigate("intake");
    }
  }

  return (
    <section className="card search-card">
      <p className="eyebrow">{t("search.eyebrow")}</p>
      <h2>{t("search.title")}</h2>

      <form className="search-form" onSubmit={submit}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search.placeholder")}
        />
        <button
          type="submit"
          className="primary-button"
          disabled={!query.trim()}
        >
          {t("common.search")}
        </button>
      </form>

      {!submitted && <p className="muted">{t("search.hint")}</p>}

      {submitted && loading && (
        <p className="muted">{t("search.searching")}</p>
      )}

      {submitted && error && <p className="pipeline-error">{te(error)}</p>}

      {submitted && !loading && total === 0 && (
        <p className="muted">
          {t("search.noResults", { query: submitted })}
        </p>
      )}

      {total > 0 && (
        <>
          <p className="muted">{tp("search.matchCount", total)}</p>

          <ul className="search-results">
            {items.map((item) => (
              <li
                className="search-result"
                key={`${item.kind}-${item.id}`}
              >
                <div className="search-result-top">
                  <span
                    className={`type-badge type-${
                      item.kind.includes("history")
                        ? "history"
                        : item.kind
                    }`}
                  >
                    {kindLabel(item.kind)}
                  </span>

                  {item.status && <StatusBadge status={item.status} />}

                  {item.changed_at && (
                    <span className="muted search-when">
                      {formatDateTime(item.changed_at)}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="search-result-title"
                  onClick={() => openResult(item)}
                >
                  {resultTitle(item)}
                </button>

                {item.snippet && (
                  <p
                    className="search-snippet"
                    // Built server-side: escaped, then the first term
                    // wrapped in <mark>. No user HTML passes through.
                    dangerouslySetInnerHTML={{ __html: item.snippet }}
                  />
                )}

                <p className="muted search-matched">
                  {t("search.matched", {
                    field: t(
                      `search.field.${item.matched_field}`,
                      {},
                      item.matched_field
                    ),
                    kind: kindLabel(item.kind),
                  })}
                </p>
              </li>
            ))}
          </ul>

          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            onChange={setOffset}
            label={t("search.resultsLabel")}
          />
        </>
      )}
    </section>
  );
}
