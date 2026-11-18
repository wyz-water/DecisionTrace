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
  const [selectedChainId, setSelectedChainId] = useState(null);
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
        const approved = (data ?? []).filter(
          (chain) => chain.teacher_status === "APPROVED"
        );
        setChains(approved);
        setSelectedChainId((current) =>
          approved.some((chain) => chain.id === current)
            ? current
            : approved[0]?.id ?? null
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
        <>
          <div className="chain-create">
            <select
              value={selectedChainId ?? ""}
              aria-label={t("execute.pickChain")}
              onChange={(event) =>
                setSelectedChainId(Number(event.target.value))
              }
            >
              {chains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  #{chain.id} {chain.title}
                </option>
              ))}
            </select>
          </div>

          {selectedChainId != null && (
            <ExecutionBoard
              chainId={selectedChainId}
              readOnly={false}
              section={section}
            />
          )}
        </>
      )}
    </section>
  );
}
