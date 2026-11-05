import { useI18n } from "../i18n";

// Shared status pill. Lives in its own module so the cycle dialog can
// render the same badge as the plan and graph views without importing
// App.jsx back into itself.
export default function StatusBadge({ status }) {
  const { t } = useI18n();

  if (!status) {
    return null;
  }

  const className = `status-badge status-${status.toLowerCase()}`;
  const label = t(
    `status.${status}`,
    {},
    status.replaceAll("_", " ")
  );

  return <span className={className}>{label}</span>;
}
