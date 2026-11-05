/**
 * Pagination — refactoring-ui constraint brief
 *
 * RANKING (steps 1-3, before any markup):
 *   This is a TERTIARY action group. It sits under a section whose
 *   primary action is elsewhere — "Confirm" on a candidate card, "Save
 *   discussion", "Update Status" — and must never compete with it. So:
 *   no fill, no accent hue, one contrast step below body text, and no
 *   shadow. The single primary action of each section stays where it is
 *   (§2.8: one primary per page).
 *   Primary   = the section's own CTA (not this component)
 *   Secondary = the list content itself
 *   Tertiary  = paging controls (this file)
 *
 * TOKENS (steps 4-6): the project has no token layer, so these are the
 * literal values already used by App.css — no new hues introduced.
 *   ink        #172033   (current page label)
 *   body       #475467   (page numbers, Prev/Next)
 *   muted      #697386   (result range — the darker of the two greys in
 *                         App.css: #858c9b lands at ~3.4:1 on white,
 *                         under AA at 11.5px)
 *   border     #dfe3ea   (step buttons) / #eceef2 (group divider)
 *   surface    #ffffff   (step buttons) / #f2f4f7 (hover) / #eef1f6 (current)
 *   focus      #315ca8   (3:1 against white; the existing #dbe7ff input
 *                         focus ring does not reach 3:1 — left alone here,
 *                         reported as a separate finding)
 *   type 12px/700 controls, 11.5px/400 meta; 30px control height (>= the
 *   24px minimum target), 8px radius (matches every button in App.css),
 *   4px inside the control row. 16px above the group, against 36px before
 *   the next group heading: the pager is the footer of the list above it,
 *   and equal spacing on both sides would make it read as a header for
 *   whatever follows (§3.6: space around a group must exceed space
 *   within it).
 *
 * ACCESSIBILITY: the current page is marked with aria-current="page" AND
 * a fill AND a heavier weight — never color alone (§5.7). The range is
 * aria-live so keyboard users hear the page change. :focus-visible keeps
 * a keyboard-only ring (15-beyond-the-book).
 *
 * HIDDEN WHEN IT WOULD DO NOTHING: one page of results renders no pager
 * at all — a disabled control bar is noise that restates the emptiness
 * (§8.4).
 */

import { useI18n } from "../i18n";

function pageWindow(current, pageCount) {
  // First, last and the current neighbourhood; everything between
  // collapses into an ellipsis. Keeps the control row a fixed width no
  // matter how many pages exist.
  const wanted = new Set([
    1,
    pageCount,
    current - 1,
    current,
    current + 1,
  ]);

  const visible = [...wanted]
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((a, b) => a - b);

  const slots = [];
  let previous = 0;

  for (const page of visible) {
    if (previous !== 0 && page - previous > 1) {
      slots.push(`gap-${previous}`);
    }

    slots.push(page);
    previous = page;
  }

  return slots;
}

export default function Pagination({
  total,
  limit,
  offset,
  onChange,
  label,
  busy = false,
}) {
  const { t } = useI18n();

  if (!total || total <= limit) {
    return null;
  }

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const current = Math.floor(offset / limit) + 1;
  const first = offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <nav className="pagination" aria-label={t("pagination.label", { label })}>
      <p className="pagination-meta" aria-live="polite">
        {t("pagination.range", { first, last, total })}
      </p>

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-button pagination-step"
          disabled={busy || current === 1}
          onClick={() => onChange(offset - limit)}
          aria-label={t("pagination.prevAria")}
        >
          {t("pagination.prev")}
        </button>

        {pageWindow(current, pageCount).map((slot) => {
          if (typeof slot === "string") {
            return (
              <span
                key={slot}
                className="pagination-ellipsis"
                aria-hidden="true"
              >
                …
              </span>
            );
          }

          if (slot === current) {
            return (
              <span
                key={slot}
                className="pagination-button is-current"
                aria-current="page"
              >
                {slot}
              </span>
            );
          }

          return (
            <button
              type="button"
              key={slot}
              className="pagination-button"
              disabled={busy}
              onClick={() => onChange((slot - 1) * limit)}
              aria-label={t("pagination.pageAria", { page: slot })}
            >
              {slot}
            </button>
          );
        })}

        <button
          type="button"
          className="pagination-button pagination-step"
          disabled={busy || current === pageCount}
          onClick={() => onChange(offset + limit)}
          aria-label={t("pagination.nextAria")}
        >
          {t("pagination.next")}
        </button>
      </div>
    </nav>
  );
}
