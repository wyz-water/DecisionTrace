# UI Design

Part II design document — DecisionTrace

**Status:** Current (2026-11-19) — matches the repositioned system.

## 1. Information Architecture

One React app, two sides, three nav groups, nine views. The topbar
carries the project switcher (student side: pick your group; supervisor
side: the switcher is not needed — the dashboard shows every group) and
the 中文/EN toggle.

```text
SUPERVISOR   Awaiting decision     待确认的决策
             In progress           进行中的决策

DECIDE       Decisions             决策
             Decision chains       决策链
             Intake & review       收集与审核

EXECUTE      Decision list         决策列表
             Tasks & commitments   划分任务承诺
             Execution order       拓扑排序
             Problems              问题
```

The view registry lives in `frontend/src/views.js`; the sidebar renders
it with badges (e.g. the intake badge shows the pending-candidate
count).

## 2. Shared Elements

- **Person colors** (`personColors.js`) — every maker name renders with
  a deterministic color derived from the name, so "who said this" is
  readable at a glance across views (candidate cards, chain nodes,
  decision rows).
- **Project-scoped numbering** (`decisionNumbers.js`) — chains `#1..#N`,
  chain points `#chain-node` (`#1-2`), free decisions `#1..#M`. Global
  ids never appear.
- **Supervisor status chips** — each decision point carries its verdict
  (待确认 / 已认可 / 待定 / 已否决 / 讨论中 / 未建链); the chip is the
  only place verdicts are shown.
- **Mermaid-free diagrams** — the execution graph is a hand-laid SVG
  (layered by topological depth); a cycle renders as an explicit
  "cannot be ordered" notice instead of a broken picture.

## 3. Interaction Conventions

- Hash routing: the sidebar, URL and back button agree; entering a view
  scrolls to the top and refreshes the decisions list (verdicts given
  on the supervisor side show up immediately).
- Extraction → review: nothing is written without the human gate; the
  candidate card anchors on the exact source sentence.
- The supervisor never navigates to act: the awaiting view renders each
  submitted chain inline, and every decision point carries its own
  action bar (只批注 / 认可 / 待定 / 否定) plus its annotation input.
- Read-only where it must be: the supervisor's in-progress boards and
  the execution graph on the student side share one component with a
  `readOnly` flag.

## 4. Component Inventory

| Component | Purpose |
|---|---|
| `App.jsx` | Shell, project context, decisions state, hash routing, view dispatch |
| `Sidebar.jsx` / `views.js` | Nav groups and badges |
| `ProjectSwitcher.jsx` | Group creation/switching/deletion |
| `DiscussionsPanel.jsx` | Paste/import meeting texts, extraction trigger |
| `CandidatesPanel.jsx` | Pending/reviewed queues, per-maker filter, confirm/edit/reject |
| `ChainPanel.jsx` | Chain list + detail: nodes with per-node threads, append revision, submit; execution board when approved |
| `TeacherDashboard.jsx` | Awaiting (inline chains, per-node verdicts/annotations) and In-progress (per-group selectors, read-only boards) |
| `ExecuteDecisions.jsx` | The approved decisions list |
| `ExecutePanel.jsx` / `ExecutionBoard.jsx` | Tasks, topological graph, AI checks — one board component, student-editable or supervisor-read-only |
| `DecisionCreateForm.jsx` | Manual decision creation (fallback path) |
| `LanguageToggle.jsx`, `Pagination.jsx` | Cross-cutting |

## 5. Mockups

The live system is the mockup — every view is implemented. The
instructor demo script (`docs/demo-script.md`) walks all nine views in
the intended presentation order.
