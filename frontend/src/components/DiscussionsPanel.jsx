import { useRef, useState } from "react";

import Pagination from "./Pagination";
import { useI18n } from "../i18n";

const API_URL = "http://127.0.0.1:8000";

const IMPORT_NAME = /\.(txt|md|markdown|docx|pdf)$/i;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * Constraint brief (refactoring-ui, Workflow B):
 *   primary   = "Save discussion" (the form's only filled button)
 *   secondary = each discussion card + its "Extract candidates" action
 *   tertiary  = the pager under the list
 * The pager stays visually quieter than every card action; see
 * components/Pagination.jsx for the token list it draws from.
 */
export default function DiscussionsPanel({ page, projectId, reload }) {
  const { t, tp, te, formatDate } = useI18n();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
  const [snapshotSavingId, setSnapshotSavingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  function pickFile(event) {
    const file = event.target.files?.[0];

    // Reset so picking the same file again re-triggers onChange.
    event.target.value = "";

    if (file) {
      importFile(file);
    }
  }

  async function importFile(file) {
    if (!IMPORT_NAME.test(file.name)) {
      setError(t("intake.importError"));
      return;
    }

    if (file.size > MAX_IMPORT_BYTES) {
      setError(t("intake.fileTooLarge"));
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const form = new FormData();
      form.append("project_id", String(projectId));
      form.append("file", file);

      const response = await fetch(`${API_URL}/discussions/import`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          te(data.detail) || t("intake.importFailed", { name: file.name })
        );
      }

      const discussion = await response.json();

      // Import and extraction are one flow: the file just imported is the
      // one the user wants candidates from.
      setNotice(
        t("intake.imported", { name: file.name, encoding: discussion.encoding })
      );

      const extractResponse = await fetch(
        `${API_URL}/candidates/extract/${discussion.id}`,
        { method: "POST" }
      );

      if (extractResponse.ok) {
        const result = await extractResponse.json();
        const skipped =
          result.skipped > 0
            ? t("intake.alreadyExisted", { count: result.skipped })
            : "";

        setNotice(
          tp("intake.importedCreated", result.created, {
            name: file.name,
            encoding: discussion.encoding,
            skipped,
          })
        );
      } else {
        setNotice(
          t("intake.importedOnly", {
            name: file.name,
            encoding: discussion.encoding,
          })
        );
      }

      page.setOffset(0);
      await reload();
    } catch (err) {
      setError(te(err.message) || t("intake.importFailed", { name: file.name }));
    } finally {
      setBusy(false);
      setDragging(false);
    }
  }

  function onDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];

    if (file) {
      importFile(file);
    }
  }

  async function createDiscussion() {
    if (!title.trim() || !content.trim()) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/discussions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: projectId,
          title,
          content,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("intake.failedCreate"));
      }

      setTitle("");
      setContent("");

      // The list is newest-first, so the discussion just saved is on the
      // first page. Returning to it is the confirmation the user needs.
      page.setOffset(0);
      await reload();
    } catch (err) {
      setError(te(err.message) || t("intake.failedCreate"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSnapshot(discussion) {
    setSnapshotSavingId(discussion.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/projects/${projectId}/snapshots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${discussion.title} · ${formatDate(
              new Date().toISOString().slice(0, 10)
            )}`,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("intake.snapshotFailed"));
      }

      // Feedback point 1: the meeting summary is a graph snapshot — one
      // click from the discussion, no manual assembly.
      setNotice(t("intake.snapshotSaved"));
    } catch (err) {
      setError(te(err.message) || t("intake.snapshotFailed"));
    } finally {
      setSnapshotSavingId(null);
    }
  }

  async function extract(discussionId) {
    setExtractingId(discussionId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `${API_URL}/candidates/extract/${discussionId}`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(te(data.detail) || t("intake.extractionFailed"));
      }

      const result = await response.json();

      if (result.created > 0 && result.skipped > 0) {
        setNotice(
          tp("intake.createdSomeSkipped", result.created, {
            count: result.created,
            skipped: result.skipped,
          })
        );
      } else if (result.created > 0) {
        setNotice(
          tp("intake.created", result.created, {
            count: result.created,
            id: discussionId,
          })
        );
      } else if (result.skipped === 1) {
        setNotice(t("intake.nothingNewOne", { id: discussionId }));
      } else if (result.skipped > 1) {
        setNotice(
          t("intake.nothingNewMany", {
            count: result.skipped,
            id: discussionId,
          })
        );
      } else {
        setNotice(t("intake.noCandidates"));
      }

      await reload();
    } catch (err) {
      setError(te(err.message) || t("intake.extractionFailed"));
    } finally {
      setExtractingId(null);
    }
  }

  return (
    <section className="card pipeline-card">
      <p className="eyebrow">{t("intake.discussionsEyebrow")}</p>
      <h2>{t("intake.importTitle")}</h2>

      <div className="pipeline-grid">
        <div
          className={
            dragging ? "discussion-form is-dragging" : "discussion-form"
          }
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            type="text"
            placeholder={t("intake.titlePlaceholder")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          <textarea
            rows={6}
            placeholder={t("intake.contentPlaceholder")}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.docx,.pdf,text/plain,text/markdown"
            hidden
            onChange={pickFile}
          />

          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy ? t("intake.importing") : t("intake.importFile")}
          </button>

          <span className="muted import-formats">
            {t("intake.formats")}
          </span>

          <button
            className="primary-button"
            disabled={busy || !title.trim() || !content.trim()}
            onClick={createDiscussion}
          >
            {busy ? t("common.saving") : t("intake.saveDiscussion")}
          </button>
        </div>

        <div>
          {notice && (
            <p className="pipeline-notice" aria-live="polite">
              {notice}
            </p>
          )}

          <div
            className={
              page.loading ? "discussion-list is-loading" : "discussion-list"
            }
            aria-busy={page.loading}
          >
            {page.total === 0 ? (
              <p className="muted">{t("intake.noDiscussions")}</p>
            ) : (
              page.items.map((discussion) => (
                <div className="discussion-item" key={discussion.id}>
                  <div>
                    <strong>{discussion.title}</strong>
                    <span>{t("intake.discussion", { id: discussion.id })}</span>
                  </div>

                  <p>{discussion.content}</p>

                  {discussion.summary && (
                    <div className="discussion-summary">
                      <span className="summary-label">
                        {t("intake.summaryLabel")}
                      </span>

                      {discussion.summary.total === 0 ? (
                        <span className="muted">
                          {t("intake.summaryEmpty")}
                        </span>
                      ) : (
                        <>
                          {discussion.summary.decisions.length > 0 && (
                            <span>
                              {t("intake.summary.decisions", {
                                names: discussion.summary.decisions.join("、"),
                              })}
                            </span>
                          )}
                          {discussion.summary.commitments.length > 0 && (
                            <span>
                              {t("intake.summary.commitments", {
                                names:
                                  discussion.summary.commitments.join("、"),
                              })}
                            </span>
                          )}
                          {discussion.summary.dependencies.length > 0 && (
                            <span>
                              {t("intake.summary.dependencies", {
                                names:
                                  discussion.summary.dependencies.join("、"),
                              })}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div className="discussion-actions">
                    <button
                      className="secondary-button"
                      disabled={extractingId === discussion.id}
                      onClick={() => extract(discussion.id)}
                    >
                      {extractingId === discussion.id
                        ? t("intake.extracting")
                        : t("intake.extract")}
                    </button>

                    <button
                      className="secondary-button"
                      disabled={snapshotSavingId === discussion.id}
                      onClick={() => saveSnapshot(discussion)}
                    >
                      {snapshotSavingId === discussion.id
                        ? t("common.working")
                        : t("intake.saveSnapshot")}
                    </button>
                  </div>
                </div>
              ))
            )}

            {error && <p className="pipeline-error">{te(error)}</p>}
            {page.error && (
              <p className="pipeline-error">{te(page.error)}</p>
            )}
          </div>

          <Pagination
            total={page.total}
            limit={page.limit}
            offset={page.offset}
            onChange={page.setOffset}
            label={t("intake.discussionsLabel")}
            busy={page.loading}
          />
        </div>
      </div>
    </section>
  );
}
