import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import StatusBadge from "./StatusBadge.jsx";

const API_URL = "http://127.0.0.1:8000";

/**
 * The responsible person's view: pick a name and see what a
 * decision-maker actually wants to know — do my decisions still stand,
 * what does my work rest on, where am I stuck, who is waiting on me,
 * and which decisions rest on mine. Everything is computed on read by
 * GET /projects/{id}/stakeholder.
 */
export default function StakeholderPanel({
  projectId,
  decisions,
  commitments,
  argumentsList,
  onOpenDecision,
}) {
  const { t, te } = useI18n();
  const [name, setName] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const names = [
    ...new Set([
      ...(commitments ?? []).map((item) => item.owner).filter(Boolean),
      ...(decisions ?? []).map((item) => item.decided_by).filter(Boolean),
      ...(argumentsList?.items ?? [])
        .map((item) => item.author)
        .filter(Boolean),
    ]),
  ].sort((first, second) => first.localeCompare(second));

  useEffect(() => {
    if (!projectId || !name) {
      setData(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    async function load() {
      try {
        const response = await fetch(
          `${API_URL}/projects/${projectId}/stakeholder?name=${encodeURIComponent(name)}`
        );

        if (!response.ok) {
          throw new Error("stakeholder.loadFailed");
        }

        if (!cancelled) {
          setData(await response.json());
        }
      } catch (err) {
        if (!cancelled) {
          setError(te(err.message) || t("stakeholder.loadFailed"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [projectId, name, te, t]);

  function decisionRow(decision) {
    return (
      <li className="stakeholder-row" key={decision.id}>
        <StatusBadge status={decision.status} />

        {decision.contested && (
          <span className="contested-badge">{t("decisions.contested")}</span>
        )}

        <a
          className="text-link"
          href="#decisions"
          onClick={() => onOpenDecision && onOpenDecision(decision.id)}
        >
          #{decision.id} {decision.title}
        </a>

        {decision.decided_by && (
          <span className="stakeholder-maker">· {decision.decided_by}</span>
        )}
      </li>
    );
  }

  return (
    <section className="card stakeholder-card">
      <p className="eyebrow">{t("stakeholder.eyebrow")}</p>

      <div className="stakeholder-head">
        <h2>{t("stakeholder.title")}</h2>

        <select
          value={name}
          aria-label={t("stakeholder.pick")}
          onChange={(event) => setName(event.target.value)}
        >
          <option value="">{t("stakeholder.pick")}</option>
          {names.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {!name && <p className="muted">{t("stakeholder.hint")}</p>}
      {loading && (
        <p className="muted" role="status">
          {t("common.loading")}
        </p>
      )}
      {error && <p className="pipeline-error">{te(error)}</p>}

      {data && !loading && (
        <>
          <h3 className="stakeholder-group">
            {t("stakeholder.decisionsMade")} ({data.decisions_made.length})
          </h3>
          {data.decisions_made.length === 0 ? (
            <p className="muted">{t("stakeholder.none")}</p>
          ) : (
            <ul className="stakeholder-list">
              {data.decisions_made.map(decisionRow)}
            </ul>
          )}

          <h3 className="stakeholder-group">
            {t("stakeholder.decisionsAffectingMe")} (
            {data.decisions_affecting_me.length})
          </h3>
          {data.decisions_affecting_me.length === 0 ? (
            <p className="muted">{t("stakeholder.none")}</p>
          ) : (
            <ul className="stakeholder-list">
              {data.decisions_affecting_me.map(decisionRow)}
            </ul>
          )}

          <h3 className="stakeholder-group">
            {t("stakeholder.commitments")} ({data.commitments.length})
          </h3>
          {data.commitments.length === 0 ? (
            <p className="muted">{t("stakeholder.none")}</p>
          ) : (
            <ul className="stakeholder-list">
              {data.commitments.map((commitment) => (
                <li className="stakeholder-row" key={commitment.id}>
                  <StatusBadge status={commitment.status} />

                  <span>
                    #{commitment.id} {commitment.description}
                  </span>

                  {commitment.state === "BLOCKED" && (
                    <span className="stakeholder-note risk">
                      {t("plan.blockedBy", {
                        names: commitment.blocked_by.join(", "),
                      })}
                    </span>
                  )}

                  {commitment.state === "WAITING" && (
                    <span className="stakeholder-note">
                      {t("plan.waitingOn", {
                        names: commitment.waiting_on.join(", "),
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h3 className="stakeholder-group">
            {t("stakeholder.waitingOnMe")} ({data.waiting_on_me.length})
          </h3>
          {data.waiting_on_me.length === 0 ? (
            <p className="muted">{t("stakeholder.none")}</p>
          ) : (
            <ul className="stakeholder-list">
              {data.waiting_on_me.map((item) => (
                <li className="stakeholder-row" key={item.commitment_id}>
                  <StatusBadge status={item.status} />
                  <span>
                    {item.owner} · {item.description}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="stakeholder-group">
            {t("stakeholder.restingOnMine")} (
            {data.decisions_resting_on_mine.length})
          </h3>
          {data.decisions_resting_on_mine.length === 0 ? (
            <p className="muted">{t("stakeholder.none")}</p>
          ) : (
            <ul className="stakeholder-list">
              {data.decisions_resting_on_mine.map(decisionRow)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
