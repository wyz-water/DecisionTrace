import { useState } from "react";

import Pagination from "./Pagination";

const API_URL = "http://127.0.0.1:8000";

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
            placeholder="Paste the meeting notes or chat transcript here..."
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />

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
