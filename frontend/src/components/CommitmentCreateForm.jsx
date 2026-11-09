import { useEffect, useId, useRef, useState } from "react";

import { useI18n } from "../i18n";

export default function CommitmentCreateForm({ projectId, decisions, onCreate }) {
  const { t, te } = useI18n();
  const formId = useId();
  const ownerRef = useRef(null);
  const descriptionRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [decisionId, setDecisionId] = useState("");
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

    if (!owner.trim()) {
      setError(t("recordForm.ownerRequired"));
      ownerRef.current?.focus();
      return;
    }

    if (!description.trim()) {
      setError(t("recordForm.descriptionRequired"));
      descriptionRef.current?.focus();
      return;
    }

    if (!event.currentTarget.reportValidity()) {
      return;
    }

    busyRef.current = true;
    setSaving(true);

    try {
      const created = await onCreate({
        owner: owner.trim(),
        description: description.trim(),
        due_date: dueDate || null,
        decision_id: decisionId ? Number(decisionId) : null,
      });

      if (mountedRef.current) {
        setOwner("");
        setDescription("");
        setDueDate("");
        setDecisionId("");
        setCreatedId(created.id);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(te(err?.message) || t("recordForm.commitmentFailed"));
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
        {t("recordForm.openCommitment")}
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
          <h2 id={`${formId}-title`}>{t("recordForm.commitmentTitle")}</h2>
          <p className="muted record-create-note" id={`${formId}-hint`}>
            {t("recordForm.manualCommitmentHint")}
          </p>

          <div className="record-create-fields">
            <label className="link-field" htmlFor={`${formId}-owner`}>
              <span>{t("common.owner")}</span>
              <input
                ref={ownerRef}
                id={`${formId}-owner`}
                type="text"
                value={owner}
                required
                disabled={saving}
                onChange={(event) => setOwner(event.target.value)}
              />
            </label>

            <label className="link-field" htmlFor={`${formId}-due-date`}>
              <span>
                {t("common.dueDate")} · {t("common.optional")}
              </span>
              <input
                id={`${formId}-due-date`}
                type="date"
                value={dueDate}
                disabled={saving}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
          </div>

          <label className="link-field" htmlFor={`${formId}-description`}>
            <span>{t("common.description")}</span>
            <textarea
              ref={descriptionRef}
              id={`${formId}-description`}
              rows={3}
              value={description}
              required
              disabled={saving}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className="link-field" htmlFor={`${formId}-decision`}>
            <span>
              {t("recordForm.linkedDecision")} · {t("common.optional")}
            </span>
            <select
              id={`${formId}-decision`}
              value={decisionId}
              disabled={saving}
              onChange={(event) => setDecisionId(event.target.value)}
            >
              <option value="">{t("recordForm.noLinkedDecision")}</option>
              {decisions.map((decision) => (
                <option key={decision.id} value={decision.id}>
                  #{decision.id} {decision.title}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}
          {createdId != null && (
            <p className="record-create-notice" role="status">
              {t("recordForm.commitmentCreated", { id: createdId })}
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
