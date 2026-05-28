import { STATUS_LABELS, type ContractStatus } from "@/lib/contracts/types";

const STYLES: Record<ContractStatus, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  viewed: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  signed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const LINK_ACTIVE_STYLE = "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300";

export function StatusBadge({
  status,
  expired,
  emailed,
}: {
  status: ContractStatus;
  expired?: boolean;
  emailed?: boolean;
}) {
  if (expired && (status === "sent" || status === "viewed")) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
        Abgelaufen
      </span>
    );
  }
  // Link erstellt, aber nie per E-Mail versendet → "Link aktiv" statt irreführend "Gesendet".
  if (status === "sent" && !emailed) {
    return (
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${LINK_ACTIVE_STYLE}`}>
        Link aktiv
      </span>
    );
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
