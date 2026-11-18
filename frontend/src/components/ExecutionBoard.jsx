import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { personColor } from "../personColors";
import StatusBadge from "./StatusBadge.jsx";

const API_URL = "http://127.0.0.1:8000";

/**
 * The execution board of a chain — the shared progress view of the
 * execution phase. Students operate it (add tasks, update statuses);
 * the supervisor sees the same board read-only. Tasks run in
 * topological order; AI checks surface cycles, blocked tasks, and
 * ordering violations, computed on read.
 */
export default function ExecutionBoard({ chainId, readOnly = false }) {
  const { t, te } = useI18n();

  const [execution, setExecution] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");

  async function reload() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/chains/${chainId}/execution`);

      if (!response.ok) {
        throw new Error(t("execution.loadFailed"));
      }

      setExecution(await response.json());
    } catch (err) {
      setError(te(err.message) || t("execution.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (chainId) {
      reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId]);

  async function addTask() {
    if (!owner.trim() || !description.trim()) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/chains/${chainId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: owner.trim(),
          description: description.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("execution.loadFailed"));
      }

      setOwner("");
      setDescription("");
      await reload();
    } catch (err) {
      setError(te(err.message) || t("execution.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(taskId, status) {
    if (!status) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/commitments/${taskId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("execution.loadFailed"));
      }

      await reload();
    } catch (err) {
      setError(te(err.message) || t("execution.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  function stateNote(task) {
    switch (task.state) {
      case "DONE":
        return t("status.DONE");
      case "READY":
        return t("status.READY");
      case "WAITING":
        return t("plan.waitingOn", { names: task.waiting_on.join(", ") });
      case "BLOCKED":
        return t("plan.blockedBy", { names: task.blocked_by.join(", ") });
      case "CYCLIC":
        return t("status.CYCLIC");
      default:
        return "";
    }
  }

  if (!execution) {
    return (
      <p className="muted" role="status">
        {t("common.loading")}
      </p>
    );
  }

  return (
    <div className="execution-board">
      <div className="decision-subheading">
        <span>{t("execution.eyebrow")}</span>
        <span className="subheading-note">
          {t("execution.taskCount", { count: execution.tasks.length })}
        </span>
      </div>

      {error && <p className="pipeline-error">{te(error)}</p>}

      {execution.checks.length > 0 && (
        <div className="execution-checks">
          {execution.checks.map((check, index) => (
            <p className="execution-check" key={index}>
              <span className="execution-check-type">
                {t(`execution.check.${check.type}`, {}, check.type)}
              </span>
              {check.message}
            </p>
          ))}
        </div>
      )}

      {execution.tasks.length === 0 ? (
        <p className="muted">{t("execution.none")}</p>
      ) : (
        <ul className="execution-list">
          {execution.tasks.map((task) => (
            <li className="execution-task" key={task.id}>
              <span className="execution-position">
                {task.position != null ? task.position + 1 : "—"}
              </span>

              <span className="chain-node-maker">
                <span
                  className="person-dot"
                  style={{ background: personColor(task.owner) }}
                  aria-hidden="true"
                />
                {task.owner}
              </span>

              <span className="execution-description">
                {task.description}
              </span>

              <StatusBadge status={task.status} />

              {task.state && (
                <span
                  className={`execution-state ${
                    task.state === "BLOCKED" ? "risk" : ""
                  }`}
                >
                  {stateNote(task)}
                </span>
              )}

              {!readOnly && (
                <select
                  className="execution-status-select"
                  value=""
                  aria-label={t("execution.updateStatus", {
                    owner: task.owner,
                  })}
                  disabled={busy}
                  onChange={(event) =>
                    updateStatus(task.id, event.target.value)
                  }
                >
                  <option value="">{t("execution.change")}</option>
                  <option value="OPEN">{t("plan.statusOpen")}</option>
                  <option value="IN_PROGRESS">
                    {t("plan.statusInProgress")}
                  </option>
                  <option value="DELAYED">
                    {t("plan.statusDelayed")}
                  </option>
                  <option value="BLOCKED">
                    {t("plan.statusBlocked")}
                  </option>
                  <option value="COMPLETED">
                    {t("plan.statusCompleted")}
                  </option>
                </select>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="execution-add">
          <input
            type="text"
            placeholder={t("execution.ownerPlaceholder")}
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          />

          <input
            type="text"
            placeholder={t("execution.descriptionPlaceholder")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <button
            type="button"
            className="primary-button"
            disabled={busy || !owner.trim() || !description.trim()}
            onClick={addTask}
          >
            {t("execution.add")}
          </button>
        </div>
      )}
    </div>
  );
}
