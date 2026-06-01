import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Mail, Phone, MapPin } from "lucide-react";
import { loadCustomer, loadContacts, loadProjectsForLead, listProjectTypes } from "@/lib/fulfillment/data";
import { formatDateDe } from "@/lib/zeit/format";
import { ContactsTab } from "./_components/contacts-tab";
import { ProjectsTab } from "./_components/projects-tab";
import { TabSwitcher } from "./_components/tab-switcher";
import { ActivitiesTab } from "./_components/activities-tab";
import { EditCustomerButton } from "./_components/edit-customer-button";
import { enrichThreadsWithProjects, loadSuggestedThreadsForEmails, loadThreadsForLead } from "@/lib/email/data";
import { loadActivitiesForLead } from "../../mail-actions";

type Tab = "aktivitaeten" | "kontakte" | "projekte";

function normalizeTab(s: string | undefined): Tab {
  if (s === "kontakte" || s === "projekte" || s === "aktivitaeten") return s;
  // Backcompat: alte Slugs auf Aktivitäten umlenken.
  if (s === "mails" || s === "verlauf") return "aktivitaeten";
  // "social" gibt es nicht mehr als Kunden-Tab → Projekte (Social ist ein Projekt-Typ).
  return "projekte";
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
  const tab: Tab = normalizeTab(sp.tab);

  const customer = await loadCustomer(id);
  if (!customer) notFound();

  const [contacts, projects, projectTypes] = await Promise.all([
    loadContacts(id),
    loadProjectsForLead(id),
    listProjectTypes({ activeOnly: true }),
  ]);

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

      {tab === "kontakte" && <ContactsTab leadId={id} contacts={contacts} />}
      {tab === "projekte" && <ProjectsTab leadId={id} projects={projects} types={projectTypes} />}
      {tab === "aktivitaeten" && await (async () => {
        const emails = [customer.email, ...contacts.map((c) => c.email)].filter((e): e is string => !!e);
        const [attached, suggested, activities] = await Promise.all([
          loadThreadsForLead(id).then(enrichThreadsWithProjects).catch(() => []),
          loadSuggestedThreadsForEmails(emails).then(enrichThreadsWithProjects).catch(() => []),
          loadActivitiesForLead(id).catch(() => []),
        ]);
        return (
          <ActivitiesTab
            leadId={id}
            initialThreads={attached}
            suggestedThreads={suggested}
            initialActivities={activities}
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
