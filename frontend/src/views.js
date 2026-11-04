/**
 * Section registry.
 *
 * The sidebar and the router read the same list, so a section can never
 * exist in one and not the other. Grouping follows the order the product
 * actually works in: what we decided -> what we are doing -> how we check
 * it. Each view is one job, not one card.
 */

export const VIEW_GROUPS = [
  {
    label: "Workspace",
    views: [{ id: "overview", label: "Overview" }],
  },
  {
    label: "Decide",
    views: [
      { id: "decisions", label: "Decisions" },
      { id: "intake", label: "Intake & review" },
    ],
  },
  {
    label: "Execute",
    views: [
      { id: "plan", label: "Plan & commitments" },
      { id: "dependencies", label: "Dependencies" },
    ],
  },
  {
    label: "Trace",
    views: [
      { id: "search", label: "Search" },
      { id: "consistency", label: "Consistency" },
      { id: "audit", label: "Audit trail" },
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
