import { useRef, useState } from "react";

import Pagination from "./Pagination";

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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
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
      setError("Please import a .txt, .md, .docx or .pdf file.");
      return;
    }

    if (file.size > MAX_IMPORT_BYTES) {
      setError("File is larger than 5 MB; split the notes and import again.");
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
        throw new Error(data.detail || `Could not import ${file.name}.`);
      }

      const discussion = await response.json();

      // Import and extraction are one flow: the file just imported is the
      // one the user wants candidates from.
      setNotice(`Imported ${file.name} (${discussion.encoding}) — extracting…`);

      const extractResponse = await fetch(
        `${API_URL}/candidates/extract/${discussion.id}`,
        { method: "POST" }
      );

      if (extractResponse.ok) {
        const result = await extractResponse.json();
        const noun = result.created === 1 ? "candidate" : "candidates";
        const skipped =
          result.skipped > 0 ? ` · ${result.skipped} already existed` : "";

        setNotice(
          `Imported ${file.name} (${discussion.encoding}) — ` +
            `${result.created} ${noun} created${skipped}.`
        );
      } else {
        setNotice(`Imported ${file.name} (${discussion.encoding}).`);
      }

      page.setOffset(0);
      await reload();
    } catch (err) {
      setError(err.message);
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
        throw new Error(data.detail || "Failed to create discussion");
      }

      setTitle("");
      setContent("");

      // The list is newest-first, so the discussion just saved is on the
      // first page. Returning to it is the confirmation the user needs.
      page.setOffset(0);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
        throw new Error(data.detail || "Extraction failed");
      }

      const result = await response.json();
      const noun = result.created === 1 ? "candidate" : "candidates";

      if (result.created > 0 && result.skipped > 0) {
        setNotice(
          `${result.created} ${noun} created · ${result.skipped} already ` +
            `extracted or reviewed`
        );
      } else if (result.created > 0) {
        setNotice(`${result.created} ${noun} created from discussion #${discussionId}`);
      } else if (result.skipped === 1) {
        setNotice(
          `Nothing new — that candidate already exists for discussion #${discussionId}`
        );
      } else if (result.skipped > 1) {
        setNotice(
          `Nothing new — all ${result.skipped} candidates already exist ` +
            `for discussion #${discussionId}`
        );
      } else {
        setNotice(
          "No candidates found. Extraction needs sentences like " +
            '"Bob will ship the API by 2026-11-20."'
        );
      }

      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setExtractingId(null);
    }
  }

  return (
    <section className="card pipeline-card">
      <p className="eyebrow">DISCUSSIONS</p>
      <h2>Import a discussion</h2>

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
            placeholder="Discussion title (e.g. Week 2 sync)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          <textarea
            rows={6}
            placeholder="Paste the meeting notes here, or drag a file anywhere onto this card..."
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
            {busy ? "Importing..." : "Import file"}
          </button>

          <span className="muted import-formats">
            .txt / .md / .docx / .pdf — imported files are saved and
            extracted in one step
          </span>

          <button
            className="primary-button"
            disabled={busy || !title.trim() || !content.trim()}
            onClick={createDiscussion}
          >
            {busy ? "Saving..." : "Save discussion"}
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
              <p className="muted">No discussions recorded yet.</p>
            ) : (
              page.items.map((discussion) => (
                <div className="discussion-item" key={discussion.id}>
                  <div>
                    <strong>{discussion.title}</strong>
                    <span>Discussion #{discussion.id}</span>
                  </div>

                  <p>{discussion.content}</p>

                  <button
                    className="secondary-button"
                    disabled={extractingId === discussion.id}
                    onClick={() => extract(discussion.id)}
                  >
                    {extractingId === discussion.id
                      ? "Extracting..."
                      : "Extract candidates"}
                  </button>
                </div>
              ))
            )}

            {error && <p className="pipeline-error">{error}</p>}
            {page.error && <p className="pipeline-error">{page.error}</p>}
          </div>

          <Pagination
            total={page.total}
            limit={page.limit}
            offset={page.offset}
            onChange={page.setOffset}
            label="Discussions"
            busy={page.loading}
          />
        </div>
      </div>
    </section>
  );
}
