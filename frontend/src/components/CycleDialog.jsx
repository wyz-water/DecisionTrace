import { useEffect, useRef } from "react";
import StatusBadge from "./StatusBadge.jsx";

/**
 * Constraint brief (Refactoring UI, workflow B).
 *
 * Ranking — primary: the loop itself, because "why did my click fail"
 * is the question the user arrives with. Secondary: the recommendation
 * and its single action. Tertiary: commitment numbers.
 * Actions — one primary (mark the stuck task as blocked), one secondary
 * (close). Nothing else competes.
 * Tokens — the project's existing literals, no new ones: ink #172033,
 * body #475467, muted #697386, border #dfe3ea, surface #ffffff, canvas
 * #f2f4f7, danger #b42318 / #fef3f2 / #fecdca, radius 18px card and
 * 8px control, control height 30px.
 */
export default function CycleDialog({
  report,
  error,
  onClose,
  onMarkBlocked,
  onRemoveLink,
  busy,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const { attempted, nodes, hops, recommendation } = report;

  // Existing links that could be removed to break the loop. The dialog
  // only recommends this when nothing can be parked, so the advice has to
  // be executable here — pointing at a button that lives on another
  // screen is the same as offering no action at all.
  const owners = {};
  for (const node of nodes) {
    owners[node.id] = node.owner;
  }

  const removableLinks = hops
    .filter((hop) => !hop.is_new && hop.dependency_id != null)
    .map((hop) => ({
      ...hop,
      fromOwner: owners[hop.from] ?? `#${hop.from}`,
      toOwner: owners[hop.to] ?? `#${hop.to}`,
    }));

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cycle-title"
        aria-describedby="cycle-summary"
        ref={dialogRef}
        tabIndex={-1}
      >
        <p className="eyebrow modal-eyebrow">Dependency refused</p>

        <h2 id="cycle-title">This link would create a circular plan</h2>

        <p className="modal-summary" id="cycle-summary">
          Making <strong>{attempted.predecessor_owner}</strong> block{" "}
          <strong>{attempted.successor_owner}</strong> closes a loop: these
          tasks would end up waiting on each other, and none of them could
          start. The link was not saved.
        </p>

        <ol className="cycle-chain">
          {nodes.map((node, index) => {
            const hop = hops[index];

            return (
              <li className="cycle-step" key={node.id}>
                <div className="cycle-node">
                  <span className="cycle-avatar" aria-hidden="true">
                    {node.owner.charAt(0)}
                  </span>

                  <div className="cycle-node-body">
                    <strong>{node.owner}</strong>
                    <p>{node.description}</p>
                  </div>

                  <StatusBadge status={node.status} />
                </div>

                {hop && (
                  <div className={`cycle-hop${hop.is_new ? " is-new" : ""}`}>
                    <span className="cycle-hop-rail" aria-hidden="true" />
                    <span className="cycle-hop-label">
                      {hop.dependency_type}
                      {hop.is_new && <em>new link</em>}
                      {index === nodes.length - 1 && <em>closes the loop</em>}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="modal-recommendation">
          <p className="eyebrow">Recommended</p>

          <p>{recommendation.message}</p>

          {removableLinks.length > 0 && (
            <>
              {recommendation.commitment_id && (
                <p className="cycle-removal-label">
                  Or break the loop by removing a link:
                </p>
              )}

              <ul className="cycle-removals">
                {removableLinks.map((link) => (
                  <li key={link.dependency_id}>
                    <span>
                      {link.fromOwner} blocks {link.toOwner}
                    </span>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onRemoveLink(link.dependency_id)}
                      disabled={busy}
                      aria-label={`Remove the link from ${link.fromOwner} to ${link.toOwner}`}
                    >
                      Remove link
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {error && (
            <p className="modal-error" role="alert">
              {error}
            </p>
          )}

          <div className="modal-actions">
            {recommendation.commitment_id && (
              <button
                type="button"
                className="primary-button"
                onClick={onMarkBlocked}
                disabled={busy}
              >
                {busy
                  ? "Marking as blocked..."
                  : `Mark ${recommendation.owner}'s task as blocked`}
              </button>
            )}

            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
