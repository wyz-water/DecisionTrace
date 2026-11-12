/**
 * Section registry.
 *
 * The sidebar and the router read the same list, so a section can never
 * exist in one and not the other. Grouping follows the order the product
 * actually works in: what we decided -> what we are doing -> how we check
 * it. Each view is one job, not one card.
 *
 * Labels are translation keys, not display strings: the sidebar resolves
 * them through `useI18n`, so switching language never leaves a stale
 * English label in the navigation.
 */

export const VIEW_GROUPS = [
  {
    labelKey: "nav.group.workspace",
    views: [{ id: "overview", labelKey: "nav.overview" }],
  },
  {
    labelKey: "nav.group.decide",
    views: [
      { id: "decisions", labelKey: "nav.decisions" },
      { id: "deliberation", labelKey: "nav.deliberation" },
      { id: "intake", labelKey: "nav.intake" },
    ],
  },
  {
    labelKey: "nav.group.execute",
    views: [
      { id: "plan", labelKey: "nav.plan" },
      { id: "dependencies", labelKey: "nav.dependencies" },
    ],
  },
  {
    labelKey: "nav.group.trace",
    views: [
      { id: "search", labelKey: "nav.search" },
      { id: "consistency", labelKey: "nav.consistency" },
      { id: "audit", labelKey: "nav.audit" },
    ],
  },
];

export const VIEW_IDS = VIEW_GROUPS.flatMap((group) =>
  group.views.map((view) => view.id)
);

export const DEFAULT_VIEW = "overview";

/** Map `#plan` / `#/plan` / anything unknown to a real view id. */
export function readView(hash) {
  const id = String(hash || "").replace(/^#\/?/, "");

  return VIEW_IDS.includes(id) ? id : DEFAULT_VIEW;
}
