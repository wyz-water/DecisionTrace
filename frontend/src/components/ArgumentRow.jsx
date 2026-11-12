import { useState } from "react";

import { useI18n } from "../i18n";

const API_URL = "http://127.0.0.1:8000";

/**
 * One argument of the deliberation layer, rendered identically in the
 * decision card and in the deliberation view — one implementation, so
 * the resolve flow (reason required, recorded on the argument) cannot
 * drift between surfaces.
 */
export default function ArgumentRow({
  argument,
  target = null,
  showTarget = false,
  onResolved,
}) {
  const { t, te } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  async function resolve() {
    if (!reason.trim()) {
      setError(t("decisions.resolveReasonRequired"));
      return;
    }

    setResolving(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/arguments/${argument.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "RESOLVED",
          resolved_reason: reason.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(
          te(data.detail) || t("decisions.resolveFailed")
        );
      }

      setReason("");
      setOpen(false);

      if (onResolved) {
        onResolved();
      }
    } catch (err) {
      setError(te(err.message) || t("decisions.resolveFailed"));
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="argument-row">
      <span
        className={`stance-badge stance-${argument.stance.toLowerCase()}`}
      >
        {t(`decisions.stance.${argument.stance}`, {}, argument.stance)}
      </span>

      <div className="argument-body">
        <p className="argument-claim">
          {argument.claim}
          {argument.author && (
            <span className="argument-author">
              {" — "}
              {argument.author}
            </span>
          )}
        </p>

        {argument.source_text && (
          <p className="argument-source">“{argument.source_text}”</p>
        )}

        {argument.status === "RESOLVED" && argument.resolved_reason && (
          <p className="argument-resolved">
            {t("decisions.resolvedBy", { reason: argument.resolved_reason })}
          </p>
        )}

        {error && <p className="pipeline-error">{te(error)}</p>}

        {showTarget &&
          (target ? (
            <a className="argument-target" href="#decisions">
              {t("deliberation.targets", {
                id: target.id,
                title: target.title,
              })}
            </a>
          ) : (
            <span className="argument-target dim">
              {t("deliberation.freeStanding")}
            </span>
          ))}
      </div>

      {argument.status === "OPEN" && argument.stance === "AGAINST" &&
        (open ? (
          <div className="argument-resolve">
            <input
              type="text"
              placeholder={t("decisions.resolveReasonPlaceholder")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />

            <button
              className="primary-button"
              disabled={resolving}
              onClick={resolve}
            >
              {t("decisions.resolve")}
            </button>

            <button
              className="secondary-button"
              onClick={() => {
                setOpen(false);
                setReason("");
                setError("");
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <button
            className="secondary-button"
            onClick={() => setOpen(true)}
          >
            {t("decisions.resolve")}
          </button>
        ))}
    </div>
  );
}
