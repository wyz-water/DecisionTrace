import { useRef, useState } from "react";

import Pagination from "./Pagination";

const API_URL = "http://127.0.0.1:8000";

const UPLOAD_NAME = /\.(txt|md|markdown)$/i;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Windows editors save text notes as UTF-8 (often with a BOM) or as GBK;
// try UTF-8 strictly first so Chinese notes don't turn into mojibake.
async function decodeTextFile(file) {
  const buffer = await file.arrayBuffer();

  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(buffer)
      .replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("gbk").decode(buffer).replace(/^\uFEFF/, "");
  }
}

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
  const fileInputRef = useRef(null);

  async function uploadFile(event) {
    const file = event.target.files?.[0];

    // Reset so picking the same file again re-triggers onChange.
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!UPLOAD_NAME.test(file.name)) {
      setError("Please upload a .txt or .md file.");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File is larger than 2 MB; split the notes and upload again.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const text = await decodeTextFile(file);

      if (!text.trim()) {
        throw new Error("That file is empty.");
      }

      setContent(text);
      setTitle((current) =>
        current.trim() ? current : file.name.replace(UPLOAD_NAME, "")
      );
      setNotice(`Loaded ${file.name} — review the text, then save.`);
    } catch (err) {
      setError(err.message || `Could not read ${file.name}.`);
    } finally {
      setBusy(false);
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
        <div className="discussion-form">
          <input
            type="text"
            placeholder="Discussion title (e.g. Week 2 sync)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          <textarea
            rows={6}
            placeholder="Paste the meeting notes here, or upload a .txt/.md file below..."
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            hidden
            onChange={uploadFile}
          />

          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload .txt / .md file
          </button>

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
