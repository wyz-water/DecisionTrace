// Shared status pill. Lives in its own module so the cycle dialog can
// render the same badge as the plan and graph views without importing
// App.jsx back into itself.
export default function StatusBadge({ status }) {
  const className = `status-badge status-${status.toLowerCase()}`;
  return <span className={className}>{status.replace("_", " ")}</span>;
}
