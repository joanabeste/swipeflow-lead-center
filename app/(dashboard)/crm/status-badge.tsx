import type { CustomLeadStatus } from "@/lib/types";

export function CrmStatusBadge({
  statusId,
  statuses,
  fallback = "–",
}: {
  statusId: string | null;
  statuses: CustomLeadStatus[];
  fallback?: string;
}) {
  if (!statusId) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        {fallback}
      </span>
    );
  }
  const status = statuses.find((s) => s.id === statusId);
  const color = status?.color ?? "#6b7280";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {status?.label ?? statusId}
    </span>
  );
}
