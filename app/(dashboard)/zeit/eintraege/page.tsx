import { requireZeitUser } from "@/lib/zeit/auth";
import { loadRecentEntries } from "../_components/data-helpers";
import { ManualEntryForm } from "./_components/manual-entry-form";
import { EntriesTable } from "./_components/entries-table";

export default async function ZeitEntriesPage() {
  const ctx = await requireZeitUser();
  const entries = await loadRecentEntries(ctx.user.id, 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Eintraege</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Letzte 100 Zeiteintraege</p>
      </div>
      <ManualEntryForm />
      <EntriesTable entries={entries} />
    </div>
  );
}
