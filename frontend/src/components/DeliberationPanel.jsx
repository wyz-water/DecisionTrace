import { useState } from "react";

import ArgumentRow from "./ArgumentRow";
import Pagination from "./Pagination";
import { useI18n } from "../i18n";

/**
 * The project-wide deliberation view: every argument in the trace,
 * including free-standing ones that no decision points to yet.
 *
 * The decision card shows the arguments of one decision; this view shows
 * the whole debate. Rows render through the shared ArgumentRow, so the
 * resolve flow is the same here and on the decision card.
 */

const FILTERS = {
  ALL: "all",
  OPEN: "open",
  RESOLVED: "resolved",
};

function matchesFilter(argument, filter) {
  if (filter === FILTERS.OPEN) {
    return argument.status === "OPEN";
  }
  if (filter === FILTERS.RESOLVED) {
    return argument.status === "RESOLVED";
  }
  return true;
}

export default function DeliberationPanel({ list, decisions, onResolved }) {
  const { t, te } = useI18n();
  const [filter, setFilter] = useState(FILTERS.ALL);

  const decisionsById = Object.fromEntries(
    (decisions ?? []).map((item) => [item.id, item])
  );

  const openObjections = (list?.items ?? []).filter(
    (item) => item.status === "OPEN" && item.stance === "AGAINST"
  );

  const freeStanding = (list?.items ?? []).filter(
    (item) => item.decision_id == null
  );

  const resolvedCount = (list?.items ?? []).filter(
    (item) => item.status === "RESOLVED"
  ).length;

  const visible = (list?.items ?? []).filter((item) =>
    matchesFilter(item, filter)
  );

  return (
    <section className="card pipeline-card">
      <p className="eyebrow">{t("deliberation.eyebrow")}</p>
      <h2>{t("deliberation.title")}</h2>
      <p>{t("deliberation.subtitle")}</p>

      <div className="deliberation-toolbar">
        {[
          [FILTERS.ALL, "deliberation.filterAll", list?.total ?? 0],
          [FILTERS.OPEN, "deliberation.filterOpen", openObjections.length],
          [FILTERS.RESOLVED, "deliberation.filterResolved", resolvedCount],
        ].map(([value, labelKey, count]) => (
          <button
            key={value}
            type="button"
            className={`filter-chip ${filter === value ? "active" : ""}`}
            onClick={() => setFilter(value)}
          >
            {t(labelKey)} ({count})
          </button>
        ))}
      </div>

      {freeStanding.length > 0 && (
        <p className="deliberation-note">
          {t("deliberation.freeStandingNote", {
            count: freeStanding.length,
          })}
        </p>
      )}

      {list?.loading && <p className="muted">{t("common.loading")}</p>}

      {!list?.loading && visible.length === 0 && (
        <p className="muted">{t("deliberation.none")}</p>
      )}

      {!list?.loading &&
        visible.map((argument) => (
          <ArgumentRow
            key={argument.id}
            argument={argument}
            target={
              argument.decision_id != null
                ? decisionsById[argument.decision_id]
                : null
            }
            showTarget
            onResolved={onResolved}
          />
        ))}

      <Pagination
        total={list?.total ?? 0}
        limit={list?.limit ?? 20}
        offset={list?.offset ?? 0}
        onChange={list?.setOffset}
        label={t("deliberation.paginationLabel")}
        busy={list?.loading}
      />

      {list?.error && <p className="pipeline-error">{te(list.error)}</p>}
    </section>
  );
}
