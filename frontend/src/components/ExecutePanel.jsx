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
  const [chains, setChains] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;

    fetch(`${API_URL}/chains?project_id=${projectId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) {
          return;
        }
        setChains(
          (data ?? []).filter(
            (chain) => chain.teacher_status === "APPROVED"
          )
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

      {chains.length === 0 ? (
        <p className="muted">{t("execute.none")}</p>
      ) : (
        chains.map((chain) => (
          <div className="teacher-group" key={chain.id}>
            <div className="teacher-group-head">
              <h3>#{chain.id} {chain.title}</h3>
            </div>

            <div className="decision-subsection">
              <ExecutionBoard
                chainId={chain.id}
                readOnly={false}
                section={section}
              />
            </div>
          </div>
        ))
      )}
    </section>
  );
}
