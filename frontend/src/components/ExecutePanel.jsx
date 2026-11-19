import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import ExecutionBoard from "./ExecutionBoard.jsx";

const API_URL = "http://127.0.0.1:8000";

/**
 * The execution phase as its own view: every chain the supervisor
 * approved, with its execution board (tasks in topological order,
 * AI checks, status updates). Students operate; this is where the
 * third module lives.
 */
export default function ExecutePanel({ projectId, section = null }) {
  const { t, te } = useI18n();
  const [selectedDecisionId, setSelectedDecisionId] = useState(null);
  const [decisionOptions, setDecisionOptions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;

    fetch(`${API_URL}/decisions?project_id=${projectId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) {
          return;
        }

        const approved = (data ?? []).filter(
          (decision) =>
            decision.teacher_status === "APPROVED" &&
            decision.chain_id != null
        );

        const options = approved.map((decision) => ({
          decisionId: decision.id,
          title: decision.title,
          chainId: decision.chain_id,
        }));

        setDecisionOptions(options);
        setSelectedDecisionId((current) =>
          options.some((option) => option.decisionId === current)
            ? current
            : options[0]?.decisionId ?? null
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("execution.loadFailed"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, t]);

  return (
    <section className="card chain-list-card">
      <p className="eyebrow">{t("execute.eyebrow")}</p>
      <h2>{t("execute.title")}</h2>
      <p className="muted">{t("execute.subtitle")}</p>

      {error && <p className="pipeline-error">{te(error)}</p>}

      {decisionOptions.length === 0 ? (
        <p className="muted">{t("execute.none")}</p>
      ) : (
        <>
          <div className="chain-create">
            <select
              value={selectedDecisionId ?? ""}
              aria-label={t("execute.pickDecision")}
              onChange={(event) =>
                setSelectedDecisionId(Number(event.target.value))
              }
            >
              {decisionOptions.map((option) => (
                <option key={option.decisionId} value={option.decisionId}>
                  #{option.decisionId} {option.title}
                </option>
              ))}
            </select>
          </div>

          {selectedDecisionId != null && (
            <ExecutionBoard
              chainId={
                decisionOptions.find(
                  (option) => option.decisionId === selectedDecisionId
                )?.chainId ?? null
              }
              decisionId={selectedDecisionId}
              readOnly={false}
              section={section}
            />
          )}
        </>
      )}
    </section>
  );
}
