import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
  const status = url.searchParams.get("status");

  const db = createServiceClient();

  let query = db.from("leads").select("*");
  if (ids && ids.length > 0) {
    query = query.in("id", ids);
  } else if (status) {
    query = query.eq("status", status);
  }

  const { data: leads } = await query.order("company_name");
  if (!leads || leads.length === 0) {
    return new Response("Keine Leads gefunden", { status: 404 });
  }

  // Kontakte für alle Leads laden
  const leadIds = leads.map((l) => l.id);
  const { data: allContacts } = await db
    .from("lead_contacts")
    .select("*")
    .in("lead_id", leadIds)
    .order("created_at");

  const { data: allJobs } = await db
    .from("lead_job_postings")
    .select("*")
    .in("lead_id", leadIds)
    .order("created_at");

  const contactsByLead = new Map<string, typeof allContacts>();
  for (const c of allContacts ?? []) {
    const list = contactsByLead.get(c.lead_id) ?? [];
    list.push(c);
    contactsByLead.set(c.lead_id, list);
  }

  const jobsByLead = new Map<string, typeof allJobs>();
  for (const j of allJobs ?? []) {
    const list = jobsByLead.get(j.lead_id) ?? [];
    list.push(j);
    jobsByLead.set(j.lead_id, list);
  }

  // Max Kontakte/Jobs ermitteln für Spaltenanzahl
  let maxContacts = 0;
  let maxJobs = 0;
  for (const lead of leads) {
    const cc = contactsByLead.get(lead.id)?.length ?? 0;
    const jj = jobsByLead.get(lead.id)?.length ?? 0;
    if (cc > maxContacts) maxContacts = cc;
    if (jj > maxJobs) maxJobs = jj;
  }
  maxContacts = Math.min(maxContacts, 5); // Max 5 Kontakte
  maxJobs = Math.min(maxJobs, 10); // Max 10 Jobs

  // CSV-Header
  const baseHeaders = [
    "Firmenname", "Domain", "Telefon", "E-Mail", "Straße", "Ort", "PLZ",
    "Bundesland", "Land", "Branche", "Unternehmensgröße", "Rechtsform",
    "Handelsregister-Nr.", "Website", "Beschreibung", "Status",
  ];

  const contactHeaders: string[] = [];
  for (let i = 1; i <= maxContacts; i++) {
    contactHeaders.push(`Kontakt ${i} Name`, `Kontakt ${i} Rolle`, `Kontakt ${i} E-Mail`, `Kontakt ${i} Telefon`);
  }

  const jobHeaders: string[] = [];
  for (let i = 1; i <= maxJobs; i++) {
    jobHeaders.push(`Stelle ${i} Titel`, `Stelle ${i} Ort`, `Stelle ${i} URL`);
  }

  const headers = [...baseHeaders, ...contactHeaders, ...jobHeaders];

  // CSV-Zeilen
  const rows = leads.map((lead) => {
    const baseRow = [
      lead.company_name, lead.domain, lead.phone, lead.email,
      lead.street, lead.city, lead.zip, lead.state, lead.country,
      lead.industry, lead.company_size, lead.legal_form,
      lead.register_id, lead.website, lead.description, lead.status,
    ];

    const contacts = (contactsByLead.get(lead.id) ?? []).slice(0, maxContacts);
    const contactRow: (string | null)[] = [];
    for (let i = 0; i < maxContacts; i++) {
      const c = contacts[i];
      contactRow.push(c?.name ?? null, c?.role ?? null, c?.email ?? null, c?.phone ?? null);
    }

    const jobs = (jobsByLead.get(lead.id) ?? []).slice(0, maxJobs);
    const jobRow: (string | null)[] = [];
    for (let i = 0; i < maxJobs; i++) {
      const j = jobs[i];
      jobRow.push(j?.title ?? null, j?.location ?? null, j?.url ?? null);
    }

    return [...baseRow, ...contactRow, ...jobRow];
  });

  // CSV generieren (Semikolon als Trennzeichen für deutsche Excel-Kompatibilität)
  function escapeCsv(val: unknown): string {
    if (val == null) return "";
    const s = String(val).replace(/"/g, '""');
    return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  }

  const csvContent = [
    headers.map(escapeCsv).join(";"),
    ...rows.map((row) => row.map(escapeCsv).join(";")),
  ].join("\n");

  // BOM für UTF-8 Excel-Kompatibilität
  const bom = "\uFEFF";
  const filename = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(bom + csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
