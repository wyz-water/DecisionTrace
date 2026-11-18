import { useState } from "react";

import ArgumentRow from "./ArgumentRow";
import { useI18n } from "../i18n";

/**
 * The project-wide deliberation view, in the same selectable form as
 * the chains view: a list of cards (one per decision with arguments,
 * plus one for free-standing concerns), click one to open its detail
 * with the shared ArgumentRow resolve flow.
 */

// A sentinel id for the free-standing concerns card.
const FREE_STANDING = 0;

export default function DeliberationPanel({ list, decisions, onResolved }) {
  const { t, te } = useI18n();
  const [selected, setSelected] = useState(null);

  const decisionsById = Object.fromEntries(
    (decisions ?? []).map((item) => [item.id, item])
  );

  const items = list?.items ?? [];

  const byDecision = new Map();
  const freeStanding = [];

  for (const argument of items) {
    if (argument.decision_id == null) {
      freeStanding.push(argument);
    } else {
      if (!byDecision.has(argument.decision_id)) {
        byDecision.set(argument.decision_id, []);
      }
      byDecision.get(argument.decision_id).push(argument);
    }
  }

  if (selected !== null) {
    const isFree = selected === FREE_STANDING;
    const decision = isFree ? null : decisionsById[selected];
    const arguments_ = isFree ? freeStanding : byDecision.get(selected) ?? [];

    const heading = isFree
      ? t("deliberation.freeStandingCard")
      : `#${decision?.id ?? "?"} ${decision?.title ?? ""}`;

    return (
      <section className="card pipeline-card">
        <div className="chain-detail-head">
          <div>
            <p className="eyebrow">{t("deliberation.eyebrow")}</p>
            <h2>{heading}</h2>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setSelected(null)}
          >
            {t("deliberation.back")}
          </button>
        </div>

        {arguments_.length === 0 ? (
          <p className="muted">{t("deliberation.none")}</p>
        ) : (
          arguments_.map((argument) => (
            <ArgumentRow
              key={argument.id}
              argument={argument}
              target={
                argument.decision_id != null
                  ? decisionsById[argument.decision_id]
                  : null
              }
              showTarget={isFree}
              onResolved={onResolved}
            />
          ))
        )}
      </section>
    );
  }

  const cards = [
    ...[...byDecision.entries()].map(([decisionId, args]) => {
      const decision = decisionsById[decisionId];
      const openObjections = args.filter(
        (item) => item.status === "OPEN" && item.stance === "AGAINST"
      );

      return (
        <article
          className="chain-card"
          key={decisionId}
          onClick={() => setSelected(decisionId)}
        >
          <div className="chain-card-head">
            <h3>
              #{decisionId} {decision?.title ?? "?"}
            </h3>

            {openObjections.length > 0 && (
              <span className="contested-badge">
                {t("decisions.contested")}
              </span>
            )}
          </div>

          <p className="chain-card-meta">
            {t("deliberation.argumentCount", { count: args.length })}
          </p>
        </article>
      );
    }),
  ];

  if (freeStanding.length > 0) {
    cards.push(
      <article
        className="chain-card"
        key="free-standing"
        onClick={() => setSelected(FREE_STANDING)}
      >
        <div className="chain-card-head">
          <h3>{t("deliberation.freeStandingCard")}</h3>
        </div>

        <p className="chain-card-meta">
          {t("deliberation.argumentCount", { count: freeStanding.length })}
        </p>
      </article>
    );
  }

  return (
    <section className="card pipeline-card">
      <p className="eyebrow">{t("deliberation.eyebrow")}</p>
      <h2>{t("deliberation.title")}</h2>
      <p>{t("deliberation.subtitle")}</p>

      {list?.loading && <p className="muted">{t("common.loading")}</p>}

      {!list?.loading && cards.length === 0 && (
        <p className="muted">{t("deliberation.none")}</p>
      )}

      {!list?.loading && <div className="chain-grid">{cards}</div>}

      {list?.error && <p className="pipeline-error">{te(list.error)}</p>}
    </section>
  );
}
