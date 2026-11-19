import { useI18n } from "../i18n";
import { personColor } from "../personColors";
import { buildDecisionNumbers } from "../decisionNumbers";

/**
 * The decision list of the execution group: decisions whose chain the
 * supervisor approved. Unapproved decisions stay in the Decisions
 * view; approved ones live here.
 */
export default function ExecuteDecisions({ decisions }) {
  const { t } = useI18n();

  const approved = (decisions ?? []).filter(
    (decision) => decision.teacher_status === "APPROVED"
  );

  const { decisionNumber, chainNumber } = buildDecisionNumbers(decisions);

  return (
    <section className="card chain-list-card">
      <p className="eyebrow">{t("execute.eyebrow")}</p>
      <h2>{t("execute.sectionDecisions")}</h2>
      <p className="muted">{t("execute.subtitle")}</p>

      {approved.length === 0 ? (
        <p className="muted">{t("execute.noDecisions")}</p>
      ) : (
        <ul className="stakeholder-list">
          {approved.map((decision) => (
            <li className="stakeholder-row" key={decision.id}>
              <span className="chain-status-chip">
                {t("chains.status.APPROVED")}
              </span>

              <span>
                {decisionNumber(decision)} {decision.title}
              </span>

              {decision.decided_by && (
                <span className="chain-node-maker">
                  <span
                    className="person-dot"
                    style={{ background: personColor(decision.decided_by) }}
                    aria-hidden="true"
                  />
                  {decision.decided_by}
                </span>
              )}

              {decision.chain_id != null && (
                <span className="stakeholder-maker">
                  {t("execute.chainOf", {
                    id: chainNumber(decision.chain_id),
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
