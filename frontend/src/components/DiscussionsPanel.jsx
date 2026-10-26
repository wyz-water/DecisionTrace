import { useState } from "react";

const API_URL = "http://127.0.0.1:8000";

export default function DiscussionsPanel({ discussions, projectId, reload }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [extractingId, setExtractingId] = useState(null);
  const [error, setError] = useState("");

  async function createDiscussion() {
    if (!title.trim() || !content.trim()) {
      return;
    }

    setBusy(true);
    setError("");

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

    try {
      const response = await fetch(
        `${API_URL}/candidates/extract/${discussionId}`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Extraction failed");
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

        <div className="discussion-list">
          {discussions.length === 0 ? (
            <p className="muted">No discussions recorded yet.</p>
          ) : (
            discussions.map((discussion) => (
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
        </div>
      </div>
    </section>
  );
}
