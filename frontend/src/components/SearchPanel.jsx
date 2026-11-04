import { useState } from "react";

import Pagination from "./Pagination";
import StatusBadge from "./StatusBadge";
import usePagedList from "../usePagedList";

const API_URL = "http://127.0.0.1:8000";

const KIND_LABELS = {
  decision: "Decision",
  commitment: "Commitment",
  discussion: "Discussion",
  decision_history: "Decision change",
  commitment_history: "Commitment change",
};

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
    hasMore,
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
      <p className="eyebrow">TRACE</p>
      <h2>Search decisions &amp; history</h2>

      <form className="search-form" onSubmit={submit}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search decisions, commitments, discussions and changes…"
        />
        <button
          type="submit"
          className="primary-button"
          disabled={!query.trim()}
        >
          Search
        </button>
      </form>

      {!submitted && (
        <p className="muted">
          Try “PostgreSQL”, “schema” or “Carol” — every term must match
          somewhere in one record.
        </p>
      )}

      {submitted && loading && <p className="muted">Searching…</p>}

      {submitted && error && <p className="pipeline-error">{error}</p>}

      {submitted && !loading && total === 0 && (
        <p className="muted">No records match “{submitted}”.</p>
      )}

      {total > 0 && (
        <>
          <p className="muted">
            {total} {total === 1 ? "record" : "records"} match.
          </p>

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
                    {KIND_LABELS[item.kind]}
                  </span>

                  {item.status && <StatusBadge status={item.status} />}

                  {item.changed_at && (
                    <span className="muted search-when">
                      {item.changed_at.replace("T", " ").slice(0, 16)}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="search-result-title"
                  onClick={() => openResult(item)}
                >
                  {item.title}
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
                  Matched {item.matched_field} · opens in{" "}
                  {KIND_LABELS[item.kind]}
                </p>
              </li>
            ))}
          </ul>

          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            hasMore={hasMore}
            setOffset={setOffset}
          />
        </>
      )}
    </section>
  );
}
