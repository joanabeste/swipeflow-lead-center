import Link from "next/link";
import { Inbox } from "lucide-react";
import { loadAllThreads } from "@/lib/email/data";
import { createServiceClient } from "@/lib/supabase/server";

type Filter = "all" | "unread" | "unassigned";

function isFilter(s: string | undefined): s is Filter {
  return s === "all" || s === "unread" || s === "unassigned";
}

const TABS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "unread", label: "Ungelesen" },
  { id: "unassigned", label: "Nicht zugeordnet" },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter: Filter = isFilter(sp.filter) ? sp.filter : "all";
  let threads: Awaited<ReturnType<typeof loadAllThreads>> = [];
  let loadError: string | null = null;
  try {
    threads = await loadAllThreads(filter);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Threads konnten nicht geladen werden.";
  }

  // Lead-Namen für zugeordnete Threads laden.
  const leadIds = [...new Set(threads.map((t) => t.lead_id).filter(Boolean) as string[])];
  const leadMap = new Map<string, string>();
  if (leadIds.length > 0) {
    const db = createServiceClient();
    const { data } = await db.from("leads").select("id, company_name").in("id", leadIds);
    for (const l of data ?? []) leadMap.set(l.id as string, (l.company_name as string) ?? "");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Inbox className="h-5 w-5 text-gray-500" />
        <h1 className="text-2xl font-semibold">Mail-Inbox</h1>
      </div>
      <p className="text-sm text-gray-500">
        Alle E-Mail-Konversationen über alle Kunden. Threads ohne Zuordnung kannst du in der Kunden-Detailseite manuell zuweisen.
      </p>

      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
        {TABS.map((t) => {
          const active = t.id === filter;
          return (
            <Link
              key={t.id}
              href={`/fulfillment/inbox?filter=${t.id}`}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${active ? "bg-primary text-gray-900 shadow-sm" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <p className="font-medium">Threads konnten nicht geladen werden.</p>
          <p className="mt-1 text-xs opacity-80">{loadError}</p>
        </div>
      ) : threads.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
          Keine Threads gefunden. Richte dein IMAP-Konto unter{" "}
          <Link href="/einstellungen/email" className="text-primary hover:underline">Einstellungen → E-Mail</Link>{" "}
          ein und starte den Sync.
        </p>
      ) : (
        <ul className="space-y-1">
          {threads.map((t) => {
            const subject = t.subject_normalized || "(ohne Betreff)";
            const leadName = t.lead_id ? leadMap.get(t.lead_id) : null;
            return (
              <li key={t.id}>
                <Link
                  href={t.lead_id ? `/fulfillment/kunden/${t.lead_id}?tab=mails` : `/fulfillment/inbox/${t.id}`}
                  className="block rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:bg-white/5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="line-clamp-1 text-sm font-medium">{subject}</p>
                        {t.unread_count > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-gray-900">{t.unread_count}</span>
                        )}
                        {!t.lead_id && (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                            nicht zugeordnet
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
                        {leadName && <span className="text-primary">{leadName} · </span>}
                        {(t.participants ?? []).slice(0, 3).join(", ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {t.last_message_at && new Date(t.last_message_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
