import { LOCALES, useI18n } from "../i18n";

/**
 * Language switch — refactoring-ui constraint brief
 *
 * RANKING: this is a tertiary control. The page's primary action lives in
 * the content area, so the switch gets no fill, no accent surface and no
 * elevation beyond the selected thumb's 1px shadow. The active option uses
 * surface + weight + `aria-pressed`, not colour alone (§2.8, §5.7).
 *
 * TOKENS: the existing topbar palette. `--border`, `--ink`, `--muted`,
 * `--surface` and `--accent` are declared in App.css; no new hues.
 *
 * SIZE: 30px control height, 8px radius, 11.5px/600 labels. The visible
 * label is short ("EN" / "中文") so the control fits beside the project
 * switcher at 375px; the full language name stays in the accessible name.
 */
export default function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className="language-switch"
      role="group"
      aria-label={t("language.label")}
    >
      {LOCALES.map((option) => {
        const active = option.id === locale;

        return (
          <button
            key={option.id}
            type="button"
            className={
              active
                ? "language-option is-active"
                : "language-option"
            }
            lang={option.htmlLang}
            aria-pressed={active}
            aria-label={`${t("language.label")}: ${option.label}`}
            title={option.label}
            onClick={() => setLocale(option.id)}
          >
            {option.id === "zh-CN" ? "中文" : option.short}
          </button>
        );
      })}
    </div>
  );
}
