import { LeadTableSkeleton } from "./lead-table-skeleton";

export default function LeadsLoading() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-white/5" />
        <div className="h-4 w-32 animate-pulse rounded bg-gray-100 dark:bg-white/5" />
      </div>
      <LeadTableSkeleton />
    </div>
  );
}
