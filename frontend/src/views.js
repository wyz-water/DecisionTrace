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
    views: [
      { id: "teacher-awaiting", labelKey: "teacher.awaiting" },
      { id: "teacher-progress", labelKey: "teacher.inProgress" },
    ],
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
    views: [
      { id: "execute-decisions", labelKey: "execute.sectionDecisions" },
      { id: "execute-tasks", labelKey: "execute.sectionTasks" },
      { id: "execute-graph", labelKey: "execute.sectionGraph" },
      { id: "execute-problems", labelKey: "execute.sectionProblems" },
    ],
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
