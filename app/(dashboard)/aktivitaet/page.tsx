import { createClient } from "@/lib/supabase/server";

const actionLabels: Record<string, string> = {
  "lead.enriched": "Lead angereichert",
  "lead.enriched_and_cancelled": "Lead angereichert & ausgeschlossen",
  "lead.updated": "Lead aktualisiert",
  "lead.bulk_status_update": "Status geändert",
  "lead.deleted": "Lead gelöscht",
  "export.success": "Export erfolgreich",
  "export.failed": "Export fehlgeschlagen",
  "import.completed": "Import abgeschlossen",
  "import.url": "URL-Import",
  "import.directory": "Verzeichnis-Import",
  "cancel_rule.created": "Ausschlussregel erstellt",
  "cancel_rule.deleted": "Ausschlussregel gelöscht",
  "cancel_rule.activated": "Ausschlussregel aktiviert",
  "cancel_rule.deactivated": "Ausschlussregel deaktiviert",
};

function formatDetails(action: string, details: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return "–";

  switch (action) {
    case "lead.enriched":
    case "lead.enriched_and_cancelled": {
      const parts: string[] = [];
      if (details.contacts_found) parts.push(`${details.contacts_found} Kontakte`);
      if (details.jobs_found) parts.push(`${details.jobs_found} Stellen`);
      if (details.pages_fetched) parts.push(`${details.pages_fetched} Seiten`);
      if (details.cancelled) parts.push("ausgeschlossen");
      return parts.join(", ") || "–";
    }
    case "lead.bulk_status_update":
      return `${details.lead_count ?? "?"} Lead(s) → ${details.new_status ?? "?"}`;
    case "lead.updated":
      return `Felder: ${(details.fields as string[])?.join(", ") ?? "?"}`;
    case "export.success":
      return `HubSpot-ID: ${details.hubspot_company_id ?? "?"}`;
    case "import.completed":
      return `${details.imported ?? 0} importiert, ${details.duplicates ?? 0} Duplikate, ${details.errors ?? 0} Fehler`;
    case "import.url":
      return `${details.company_name ?? details.url ?? "–"}`;
    case "import.directory":
      return `${details.imported ?? 0} importiert, ${details.filtered ?? 0} gefiltert`;
    default:
      // Fallback: Key-Value kompakt
      return Object.entries(details)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(", ")
        .slice(0, 120) || "–";
  }
}

export default async function AktivitaetPage() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("*, profiles(name, email)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Aktivität</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Protokoll aller Aktionen im System
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Zeitpunkt</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Nutzer</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Aktion</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {(!logs || logs.length === 0) ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Noch keine Aktivitäten protokolliert.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(log.created_at).toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {(log.profiles as { name: string; email: string } | null)?.name ?? "System"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {actionLabels[log.action] ?? log.action}
                  </td>
                  <td className="max-w-sm px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {formatDetails(log.action, log.details as Record<string, unknown>)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
