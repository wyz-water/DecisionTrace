import { useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";

/**
 * GitHub-Desktop style project switcher: the project chip in the top bar
 * opens a searchable menu of every project, with an inline "new project"
 * form as the footer action. Selecting a row swaps the whole dashboard.
 */
export default function ProjectSwitcher({
  projects,
  activeProject,
  onSelect,
  onCreate,
  onDelete,
}) {
  const { t, te } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("list"); // list | create
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);
  const searchRef = useRef(null);

  const filtered = projects.filter((project) => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      return true;
    }

    return (
      project.name.toLowerCase().includes(needle) ||
      (project.description ?? "").toLowerCase().includes(needle)
    );
  });

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open && mode === "list") {
      searchRef.current?.focus();
    }
  }, [open, mode]);

  function openMenu() {
    setQuery("");
    setMode("list");
    setError("");
    setConfirmingId(null);
    setOpen(true);
  }

  async function handleDelete(project) {
    setSaving(true);
    setError("");

    try {
      await onDelete(project);
      setConfirmingId(null);
      setOpen(false);
    } catch (err) {
      setError(te(err.message) || t("project.couldNotDelete"));
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    setName(query.trim());
    setMode("create");
    setError("");
  }

  async function submitCreate(event) {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onCreate(name.trim(), description.trim() || null);
      setOpen(false);
    } catch (err) {
      setError(te(err.message) || t("project.couldNotCreate"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="project-switcher">
      <button
        type="button"
        className="project-label project-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span className="project-switcher-name">
          {activeProject?.name || t("project.select")}
        </span>
        <span className="project-switcher-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* Click-away scrim: invisible, sits between the page and the
              menu so a stray click closes the dropdown. */}
          <div
            className="project-switcher-scrim"
            onClick={() => setOpen(false)}
          />

          <div className="project-switcher-menu" role="menu">
            {mode === "list" ? (
              <>
                <input
                  ref={searchRef}
                  type="text"
                  className="project-switcher-search"
                  placeholder={t("project.find")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />

                <div className="project-switcher-list">
                  {filtered.length === 0 && (
                    <p className="project-switcher-empty">
                      {t("project.noMatch", { query })}
                    </p>
                  )}

                  {filtered.map((project) => {
                    const active = project.id === activeProject?.id;

                    if (confirmingId === project.id) {
                      return (
                        <div
                          className="project-switcher-item is-confirming"
                          key={project.id}
                        >
                          <div className="project-switcher-confirm-text">
                            <strong>
                              {t("project.deleteConfirm", {
                                name: project.name,
                              })}
                            </strong>
                            <span>{t("project.deleteWarning")}</span>
                          </div>

                          <div className="project-switcher-confirm-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={saving}
                              onClick={() => setConfirmingId(null)}
                            >
                              {t("common.cancel")}
                            </button>

                            <button
                              type="button"
                              className="project-switcher-delete-confirm"
                              disabled={saving}
                              onClick={() => handleDelete(project)}
                            >
                              {saving ? t("common.deleting") : t("common.delete")}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        className={
                          active
                            ? "project-switcher-item is-active"
                            : "project-switcher-item"
                        }
                        key={project.id}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="project-switcher-item-main"
                          onClick={() => {
                            setOpen(false);

                            if (!active) {
                              onSelect(project);
                            }
                          }}
                        >
                          <span className="project-switcher-check">
                            {active ? "✓" : ""}
                          </span>

                          <span className="project-switcher-item-text">
                            <strong>{project.name}</strong>

                            {project.description && (
                              <span>{project.description}</span>
                            )}
                          </span>
                        </button>

                        <button
                          type="button"
                          className="project-switcher-item-delete"
                          aria-label={t("project.deleteAria", {
                            name: project.name,
                          })}
                          onClick={() => {
                            setConfirmingId(project.id);
                            setError("");
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>

                {error && <p className="pipeline-error">{error}</p>}

                <button
                  type="button"
                  className="project-switcher-new"
                  onClick={startCreate}
                >
                  {t("project.new")}
                </button>
              </>
            ) : (
              <form className="project-switcher-form" onSubmit={submitCreate}>
                <strong>{t("project.newTitle")}</strong>

                <input
                  type="text"
                  placeholder={t("project.name")}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />

                <input
                  type="text"
                  placeholder={t("project.description")}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />

                {error && <p className="pipeline-error">{error}</p>}

                <div className="project-switcher-form-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving || !name.trim()}
                  >
                    {saving ? t("common.creating") : t("project.create")}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={saving}
                    onClick={() => setMode("list")}
                  >
                    {t("common.back")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
