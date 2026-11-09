import { useEffect, useId, useRef, useState } from "react";

import { useI18n } from "../i18n";

export default function DecisionCreateForm({ projectId, onCreate }) {
  const { t, te } = useI18n();
  const formId = useId();
  const titleRef = useRef(null);
  const sourceRef = useRef(null);
  const rationaleRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [sourceDiscussion, setSourceDiscussion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdId, setCreatedId] = useState(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();

    if (busyRef.current || !projectId) {
      return;
    }

    setError("");
    setCreatedId(null);

    if (!title.trim()) {
      setError(t("recordForm.titleRequired"));
      titleRef.current?.focus();
      return;
    }

    // Feedback point 0: a decision must record its goal. The backend
    // enforces the same rule for the API path.
    if (!rationale.trim()) {
      setError(t("recordForm.rationaleRequired"));
      rationaleRef.current?.focus();
      return;
    }

    const source = sourceDiscussion.trim();
    const sourceId = source ? Number(source) : null;

    if (
      source &&
      (!/^\d+$/.test(source) || !Number.isSafeInteger(sourceId) || sourceId < 1)
    ) {
      setError(t("recordForm.invalidDiscussion"));
      sourceRef.current?.focus();
      return;
    }

    if (!event.currentTarget.reportValidity()) {
      return;
    }

    busyRef.current = true;
    setSaving(true);

    try {
      const created = await onCreate({
        title: title.trim(),
        rationale: rationale.trim() || null,
        source_discussion_id: sourceId,
      });

      if (mountedRef.current) {
        setTitle("");
        setRationale("");
        setSourceDiscussion("");
        setCreatedId(created.id);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(te(err?.message) || t("recordForm.decisionFailed"));
      }
    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  return (
    <section className="card record-create-card">
      <button
        type="button"
        className="secondary-button"
        aria-expanded={open}
        aria-controls={`${formId}-form`}
        disabled={!projectId || saving}
        onClick={() => setOpen((current) => !current)}
      >
        {t("recordForm.openDecision")}
      </button>

      {open && (
        <form
          id={`${formId}-form`}
          className="decision-editor record-create-form"
          aria-labelledby={`${formId}-title`}
          aria-describedby={`${formId}-hint`}
          aria-busy={saving}
          noValidate
          onSubmit={submit}
        >
          <h2 id={`${formId}-title`}>{t("recordForm.decisionTitle")}</h2>
          <p className="muted record-create-note" id={`${formId}-hint`}>
            {t("recordForm.manualDecisionHint")}
          </p>

          <div className="record-create-fields">
            <label className="link-field" htmlFor={`${formId}-name`}>
              <span>{t("common.title")}</span>
              <input
                ref={titleRef}
                id={`${formId}-name`}
                type="text"
                value={title}
                required
                disabled={saving}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label className="link-field" htmlFor={`${formId}-source`}>
              <span>
                {t("recordForm.sourceDiscussion")} · {t("common.optional")}
              </span>
              <input
                ref={sourceRef}
                id={`${formId}-source`}
                type="number"
                min="1"
                step="1"
                value={sourceDiscussion}
                disabled={saving}
                aria-describedby={`${formId}-source-hint`}
                onChange={(event) => setSourceDiscussion(event.target.value)}
              />
              <small
                className="muted record-create-note"
                id={`${formId}-source-hint`}
              >
                {t("recordForm.sourceDiscussionHint")}
              </small>
            </label>
          </div>

          <label className="link-field" htmlFor={`${formId}-rationale`}>
            <span>
              {t("common.rationale")} · {t("recordForm.goalNote")}
            </span>
            <textarea
              ref={rationaleRef}
              id={`${formId}-rationale`}
              rows={3}
              value={rationale}
              required
              disabled={saving}
              onChange={(event) => setRationale(event.target.value)}
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}
          {createdId != null && (
            <p className="record-create-notice" role="status">
              {t("recordForm.decisionCreated", { id: createdId })}
            </p>
          )}

          <div className="editor-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={saving || !projectId}
            >
              {saving ? t("common.creating") : t("common.create")}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
