import { useState } from "react";
import { useI18n } from "../i18n";
import Pagination from "./Pagination.jsx";
import StatusBadge from "./StatusBadge.jsx";

const HYPOTHETICAL_STATUSES = ["DELAYED", "BLOCKED"];
const IMPACT_PAGE_SIZE = 5;

function pageOffset(offset, total) {
  const maxOffset =
    total > 0
      ? Math.floor((total - 1) / IMPACT_PAGE_SIZE) * IMPACT_PAGE_SIZE
      : 0;

  return Math.min(offset, maxOffset);
}

function ImpactItem({ item, byId, muted = false }) {
  const { t } = useI18n();

  return (
    <article className={`impact-item ${muted ? "is-already" : "is-new"}`}>
      <div className="impact-item-head">
        <strong>{item.owner}</strong>
        <span className="impact-item-id">#{item.id}</span>
        <StatusBadge status={item.status} />
      </div>

      <p>{item.description}</p>

      <div className="impact-item-meta">
        <span className="impact-path">
          {item.path.map((id) => byId[id]?.owner ?? `#${id}`).join(" → ")}
        </span>

        <span className="impact-depth">
          {t("impact.depth", { depth: item.depth })}
        </span>
      </div>
    </article>
  );
}

function ImpactPanel({
  selectedNode,
  currentImpact,
  whatIf,
  whatIfStatus,
  onPreview,
  onStatusChange,
  onClose,
  previewOpen,
  impactLoading,
  previewLoading,
  error,
  byId,
  variant = "card",
}) {
  const { t } = useI18n();
  const docked = variant === "docked";
  const [currentOffset, setCurrentOffset] = useState(0);
  const [newlyOffset, setNewlyOffset] = useState(0);
  const [alreadyOffset, setAlreadyOffset] = useState(0);
  const preview = previewOpen ? whatIf : null;
  const currentItems = currentImpact?.affected_commitments ?? [];
  const newlyAffected = preview
    ? preview.affected.filter((item) => item.newly_affected)
    : [];
  const alreadyAffected = preview
    ? preview.affected.filter((item) => !item.newly_affected)
    : [];
  const currentSafeOffset = pageOffset(currentOffset, currentItems.length);
  const newlySafeOffset = pageOffset(newlyOffset, newlyAffected.length);
  const alreadySafeOffset = pageOffset(alreadyOffset, alreadyAffected.length);
  const currentPage = currentItems.slice(
    currentSafeOffset,
    currentSafeOffset + IMPACT_PAGE_SIZE
  );
  const newlyPage = newlyAffected.slice(
    newlySafeOffset,
    newlySafeOffset + IMPACT_PAGE_SIZE
  );
  const alreadyPage = alreadyAffected.slice(
    alreadySafeOffset,
    alreadySafeOffset + IMPACT_PAGE_SIZE
  );
  const statusLabel = t(
    `status.${whatIfStatus}`,
    {},
    whatIfStatus.replace("_", " ")
  );
  const title = !selectedNode
    ? t("impact.noSelection")
    : previewOpen
      ? t("impact.previewTitle", {
          owner: selectedNode.owner,
          status: statusLabel,
        })
      : impactLoading
        ? t("impact.checking")
        : currentImpact?.has_impact
          ? t("impact.detected")
          : t("impact.none");

  return (
    <section
      id="impact-panel"
      className={`card impact-panel impact-panel-${variant} ${
        previewOpen ? "is-preview" : ""
      } ${currentImpact?.has_impact ? "impact-active" : ""}`}
      aria-label={t("impact.eyebrow")}
    >
      <div className="impact-panel-head">
        {(previewOpen || docked) && (
          <div className="impact-panel-badges">
            {previewOpen && (
              <span className="preview-badge">
                {t("impact.previewBadge")}
              </span>
            )}

            {docked && (
              <button
                type="button"
                className="impact-close"
                onClick={onClose}
                aria-label={t("impact.closePanel")}
              >
                ×
              </button>
            )}
          </div>
        )}

        <div>
          <p className="eyebrow">{t("impact.eyebrow")}</p>
          <h2>{title}</h2>
        </div>
      </div>

      {!selectedNode ? (
        <>
          <p className="muted">{t("impact.pick")}</p>

          <a className="text-link" href="#plan">
            {t("impact.openPlan")}
          </a>
        </>
      ) : (
        <>
          <p className="muted source-note">
            {previewOpen
              ? t("impact.sourcePreview", {
                  owner: selectedNode.owner,
                  id: selectedNode.id,
                  current: t(
                    `status.${currentImpact?.commitment_status ?? selectedNode.status}`,
                    {},
                    selectedNode.status
                  ),
                  hypothetical: statusLabel,
                })
              : t("impact.source", {
                  owner: selectedNode.owner,
                  id: selectedNode.id,
                  status: t(
                    `status.${currentImpact?.commitment_status ?? selectedNode.status}`,
                    {},
                    selectedNode.status
                  ),
                })}
          </p>

          <div className="impact-controls">
            <span className="impact-control-label">
              {t("impact.hypothetical")}
            </span>

            <div
              className="impact-status-toggle"
              role="group"
              aria-label={t("impact.hypothetical")}
            >
              {HYPOTHETICAL_STATUSES.map((status) => (
                <button
                  type="button"
                  key={status}
                  className={whatIfStatus === status ? "is-active" : ""}
                  aria-pressed={whatIfStatus === status}
                  onClick={() => onStatusChange(status)}
                >
                  {t(`status.${status}`, {}, status)}
                </button>
              ))}
            </div>

            {!previewOpen && (
              <button
                type="button"
                className="primary-button"
                onClick={() => onPreview(whatIfStatus)}
                disabled={previewLoading}
              >
                {previewLoading
                  ? t("impact.previewing")
                  : t("impact.previewAction")}
              </button>
            )}

            {previewOpen && !docked && (
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                {t("impact.exitPreview")}
              </button>
            )}
          </div>

          {error && (
            <p className="pipeline-error" role="alert">
              {error}
            </p>
          )}

          {previewOpen ? (
            previewLoading ? (
              <p className="muted" role="status">
                {t("common.loading")}
              </p>
            ) : preview ? (
              <>
                <div className="impact-summary" role="group">
                  <div className="impact-stat">
                    <strong>{preview.current_total}</strong>
                    <span>{t("impact.currentAffected")}</span>
                  </div>

                  <div className="impact-stat">
                    <strong>{preview.total}</strong>
                    <span>{t("impact.previewAffected")}</span>
                  </div>

                  <div className="impact-stat is-new">
                    <strong>{preview.newly_affected.length}</strong>
                    <span>{t("impact.newlyAffected")}</span>
                  </div>

                  <div className="impact-stat is-already">
                    <strong>{preview.already_affected.length}</strong>
                    <span>{t("impact.alreadyAffected")}</span>
                  </div>
                </div>

                {preview.has_cycle && (
                  <p className="impact-warning">
                    {t("impact.cycleWarning")}
                  </p>
                )}

                {preview.total === 0 ? (
                  <p className="muted">{t("impact.previewEmpty")}</p>
                ) : (
                  <>
                    {newlyAffected.length > 0 && (
                      <div className="impact-group">
                        <h3 className="impact-group-title is-new">
                          {t("impact.newlyAffected")}
                        </h3>

                        {newlyPage.map((item) => (
                          <ImpactItem
                            item={item}
                            byId={byId}
                            key={item.id}
                          />
                        ))}

                        <Pagination
                          total={newlyAffected.length}
                          limit={IMPACT_PAGE_SIZE}
                          offset={newlySafeOffset}
                          onChange={setNewlyOffset}
                          label={t("impact.newlyAffected")}
                        />
                      </div>
                    )}

                    {alreadyAffected.length > 0 && (
                      <div className="impact-group">
                        <h3 className="impact-group-title is-already">
                          {t("impact.alreadyAffected")}
                        </h3>

                        {alreadyPage.map((item) => (
                          <ImpactItem
                            item={item}
                            byId={byId}
                            key={item.id}
                            muted
                          />
                        ))}

                        <Pagination
                          total={alreadyAffected.length}
                          limit={IMPACT_PAGE_SIZE}
                          offset={alreadySafeOffset}
                          onChange={setAlreadyOffset}
                          label={t("impact.alreadyAffected")}
                        />
                      </div>
                    )}
                  </>
                )}

                <p className="impact-preview-note">
                  {t("impact.previewNote")}
                </p>
              </>
            ) : (
              <p className="muted">{t("impact.previewHint")}</p>
            )
          ) : impactLoading ? (
            <p className="muted" role="status">
              {t("common.loading")}
            </p>
          ) : currentImpact ? (
            currentItems.length > 0 ? (
              <div className="impact-current">
                <h3 className="impact-group-title">
                  {t("impact.currentAffected")}
                </h3>

                {currentPage.map((item) => (
                  <ImpactItem item={item} byId={byId} key={item.id} />
                ))}

                <Pagination
                  total={currentItems.length}
                  limit={IMPACT_PAGE_SIZE}
                  offset={currentSafeOffset}
                  onChange={setCurrentOffset}
                  label={t("impact.currentAffected")}
                />
              </div>
            ) : (
              <p className="muted">{t("impact.safe")}</p>
            )
          ) : (
            <p className="muted">{t("impact.previewHint")}</p>
          )}
        </>
      )}
    </section>
  );
}

export default ImpactPanel;
