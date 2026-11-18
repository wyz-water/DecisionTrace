/**
 * Section registry — the repositioned system.
 *
 * Student side: decisions (the records), chains (discussion + submit +
 * execution), intake (paste + extract + review).
 * Supervisor side: the teacher dashboard.
 */

export const VIEW_GROUPS = [
  {
    labelKey: "nav.group.teacher",
    views: [{ id: "teacher", labelKey: "nav.teacher" }],
  },
  {
    labelKey: "nav.group.decide",
    views: [
      { id: "decisions", labelKey: "nav.decisions" },
      { id: "chains", labelKey: "nav.chains" },
      { id: "intake", labelKey: "nav.intake" },
    ],
  },
  {
    labelKey: "nav.group.execute",
    views: [{ id: "execute", labelKey: "nav.execute" }],
  },
];

export const VIEW_IDS = VIEW_GROUPS.flatMap((group) =>
  group.views.map((view) => view.id)
);

export const DEFAULT_VIEW = "chains";

/** Map `#plan` / `#/plan` / anything unknown to a real view id. */
export function readView(hash) {
  const id = String(hash || "").replace(/^#\/?/, "");

  return VIEW_IDS.includes(id) ? id : DEFAULT_VIEW;
}
