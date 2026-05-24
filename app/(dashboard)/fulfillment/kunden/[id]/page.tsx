import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Mail, Phone, MapPin } from "lucide-react";
import { loadCustomer, loadContacts, loadProjectsForLead } from "@/lib/fulfillment/data";
import { formatDateDe } from "@/lib/zeit/format";
import { ContactsTab } from "./_components/contacts-tab";
import { ProjectsTab } from "./_components/projects-tab";
import { TabSwitcher } from "./_components/tab-switcher";
import { MailsTab } from "./_components/mails-tab";
import { EditCustomerButton } from "./_components/edit-customer-button";
import { enrichThreadsWithProjects, loadSuggestedThreadsForEmails, loadThreadsForLead } from "@/lib/email/data";

type Tab = "verlauf" | "kontakte" | "projekte" | "mails";

function isTab(s: string | undefined): s is Tab {
  return s === "verlauf" || s === "kontakte" || s === "projekte" || s === "mails";
}

export default async function KundenDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = isTab(sp.tab) ? sp.tab : "projekte";

  const customer = await loadCustomer(id);
  if (!customer) notFound();

  const [contacts, projects] = await Promise.all([loadContacts(id), loadProjectsForLead(id)]);

  return (
    <div className="space-y-6">
      <Link href="/fulfillment/kunden" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Zurueck zur Kunden-Uebersicht
      </Link>

      <header className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              Kunde
            </span>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{customer.company_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {customer.city && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{customer.city}</span>
              )}
              {customer.website && (
                <a href={customer.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                  <Globe className="h-3.5 w-3.5" />{customer.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {(customer.email || customer.phone) && (
                <span className="inline-flex items-center gap-2" title="Primärer Kontakt — pflegen im Tab Kontakte">
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                      <Mail className="h-3.5 w-3.5" />{customer.email}
                    </a>
                  )}
                  {customer.phone && (
                    <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                      <Phone className="h-3.5 w-3.5" />{customer.phone}
                    </a>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 text-right text-xs text-gray-500">
            <EditCustomerButton
              customer={{
                id: customer.id,
                company_name: customer.company_name,
                website: customer.website,
                street: customer.street,
                zip: customer.zip,
                city: customer.city,
              }}
            />
            {customer.became_customer_at && (
              <p>Kunde seit<br />
                <strong className="text-gray-700 dark:text-gray-200">{formatDateDe(customer.became_customer_at)}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Kontakte" value={contacts.length.toString()} />
          <Stat label="Projekte" value={projects.length.toString()} />
          <Stat label="Aktive Projekte" value={projects.filter((p) => p.status === "active" || p.status === "onboarding").length.toString()} />
        </div>
      </header>

      <TabSwitcher current={tab} basePath={`/fulfillment/kunden/${id}`} />

      {tab === "verlauf" && <VerlaufTab leadId={id} />}
      {tab === "kontakte" && <ContactsTab leadId={id} contacts={contacts} />}
      {tab === "projekte" && <ProjectsTab leadId={id} projects={projects} />}
      {tab === "mails" && await (async () => {
        const emails = [customer.email, ...contacts.map((c) => c.email)].filter((e): e is string => !!e);
        const [attached, suggested] = await Promise.all([
          loadThreadsForLead(id).then(enrichThreadsWithProjects).catch(() => []),
          loadSuggestedThreadsForEmails(emails).then(enrichThreadsWithProjects).catch(() => []),
        ]);
        return (
          <MailsTab
            leadId={id}
            initialThreads={attached}
            suggestedThreads={suggested}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            defaultTo={contacts.find((c) => c.is_primary && c.email)?.email ?? contacts.find((c) => c.email)?.email ?? customer.email ?? null}
          />
        );
      })()}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2 dark:border-[#2c2c2e]/40">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

async function VerlaufTab({ leadId }: { leadId: string }) {
  const { createServiceClient } = await import("@/lib/supabase/server");
  const db = createServiceClient();
  const [{ data: notes }, { data: calls }] = await Promise.all([
    db.from("lead_notes").select("id, content, created_at, created_by").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(50),
    db.from("lead_calls").select("id, direction, duration_seconds, started_at, note, call_provider").eq("lead_id", leadId).order("started_at", { ascending: false }).limit(50),
  ]);
  type Item = { kind: "note" | "call"; at: string; content: string; meta?: string };
  const items: Item[] = [
    ...(notes ?? []).map((n: { content: string; created_at: string }) => ({ kind: "note" as const, at: n.created_at, content: n.content })),
    ...(calls ?? []).map((c: { direction: string; started_at: string; note: string | null; duration_seconds: number | null; call_provider: string }) => ({
      kind: "call" as const,
      at: c.started_at,
      content: c.note ?? "(ohne Notiz)",
      meta: `${c.direction === "inbound" ? "Eingehend" : "Ausgehend"} · ${c.duration_seconds ?? 0}s · ${c.call_provider}`,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (items.length === 0) {
    return <p className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">Noch keine Notizen oder Calls.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="font-semibold uppercase tracking-wider">{it.kind === "note" ? "Notiz" : "Anruf"}</span>
            <span>{formatDateDe(it.at)}</span>
          </div>
          {it.meta && <p className="mt-1 text-xs text-gray-400">{it.meta}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{it.content}</p>
        </li>
      ))}
    </ul>
  );
}
