import Link from "next/link";
import { Inbox } from "lucide-react";
import { loadAllThreads } from "@/lib/email/data";
import { createServiceClient } from "@/lib/supabase/server";
import { InboxThreadRow } from "./_components/inbox-thread-row";

type Filter = "all" | "unread" | "unassigned";

function isFilter(s: string | undefined): s is Filter {
  return s === "all" || s === "unread" || s === "unassigned";
}

const TABS: Array<{ id: Filter; label: string }> = [
  { id: "unassigned", label: "Nicht zugeordnet" },
  { id: "unread", label: "Ungelesen" },
  { id: "all", label: "Alle" },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  // Default: "unassigned" — Triage-Workflow zuerst.
  const filter: Filter = isFilter(sp.filter) ? sp.filter : "unassigned";
  let threads: Awaited<ReturnType<typeof loadAllThreads>> = [];
  let loadError: string | null = null;
  try {
    threads = await loadAllThreads(filter);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Threads konnten nicht geladen werden.";
  }

  // Lead-Namen für zugeordnete Threads + komplette Kunden-Liste fuer Inline-Assign.
  const db = createServiceClient();
  const leadIds = [...new Set(threads.map((t) => t.lead_id).filter(Boolean) as string[])];
  const leadMap = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data } = await db.from("leads").select("id, company_name").in("id", leadIds);
    for (const l of data ?? []) leadMap.set(l.id as string, (l.company_name as string) ?? "");
  }
  const { data: customerRows } = await db
    .from("leads")
    .select("id, company_name")
    .eq("lifecycle_stage", "customer")
    .order("company_name", { ascending: true });
  const customers = ((customerRows ?? []) as Array<{ id: string; company_name: string | null }>)
    .filter((c) => c.company_name)
    .map((c) => ({ id: c.id, company_name: c.company_name as string }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Inbox className="h-5 w-5 text-gray-500" />
        <h1 className="text-2xl font-semibold">Mail-Inbox</h1>
      </div>
      <p className="text-sm text-gray-500">
        Triage-Ansicht: ordne neue Threads einem Kunden zu. Lesen/Antworten passiert dann im Kunden-Mails-Tab.
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
          {filter === "unassigned"
            ? "Keine nicht-zugeordneten Threads. Alles im Griff."
            : (
              <>
                Keine Threads gefunden. Richte dein IMAP-Konto unter{" "}
                <Link href="/einstellungen/email" className="text-primary hover:underline">Einstellungen → E-Mail</Link>{" "}
                ein und starte den Sync.
              </>
            )}
        </p>
      ) : (
        <ul className="space-y-1">
          {threads.map((t) => (
            <li key={t.id}>
              <InboxThreadRow
                threadId={t.id}
                leadId={t.lead_id}
                subject={t.subject_normalized || "(ohne Betreff)"}
                unreadCount={t.unread_count}
                leadName={t.lead_id ? leadMap.get(t.lead_id) ?? null : null}
                participants={t.participants ?? []}
                lastMessageAt={t.last_message_at}
                customers={customers}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
