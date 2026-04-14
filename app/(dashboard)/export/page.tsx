import { createClient } from "@/lib/supabase/server";
import { ExportManager, type QualifiedLead } from "./export-manager";

export default async function ExportPage() {
  const supabase = await createClient();

  const [{ data: leads, count }, { data: exportLogs }] =
    await Promise.all([
      supabase
        .from("leads")
        .select(
          `
            id, company_name, domain, city, status, industry, company_size,
            phone, email, has_ssl, is_mobile_friendly, page_speed_score,
            website_tech, website_age_estimate, website_issues,
            enriched_at, updated_at,
            lead_contacts(count),
            lead_job_postings(count)
          `,
          { count: "exact" },
        )
        .eq("status", "qualified")
        .order("updated_at", { ascending: false }),
      supabase
        .from("export_logs")
        .select("*, leads(company_name)")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  // Typ ableiten: Webdesign wenn webdev-Felder gefüllt, sonst Recruiting
  const qualifiedLeads: QualifiedLead[] = (leads ?? []).map((l) => {
    const isWebdev =
      l.has_ssl !== null ||
      l.is_mobile_friendly !== null ||
      l.page_speed_score !== null ||
      (Array.isArray(l.website_issues) && l.website_issues.length > 0);
    const contactsCount = Array.isArray(l.lead_contacts) && l.lead_contacts[0]
      ? (l.lead_contacts[0] as { count: number }).count
      : 0;
    const jobsCount = Array.isArray(l.lead_job_postings) && l.lead_job_postings[0]
      ? (l.lead_job_postings[0] as { count: number }).count
      : 0;

    return {
      id: l.id,
      company_name: l.company_name,
      domain: l.domain,
      city: l.city,
      industry: l.industry,
      company_size: l.company_size,
      phone: l.phone,
      email: l.email,
      service_type: isWebdev ? "webdesign" : "recruiting",
      contacts_count: contactsCount,
      jobs_count: jobsCount,
      issues_count: Array.isArray(l.website_issues) ? l.website_issues.length : 0,
      has_ssl: l.has_ssl,
      website_tech: l.website_tech,
      website_age_estimate: l.website_age_estimate,
      enriched_at: l.enriched_at,
      updated_at: l.updated_at,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">HubSpot-Export</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {count ?? 0} qualifizierte Leads bereit zum Export
      </p>

      <ExportManager qualifiedLeads={qualifiedLeads} exportLogs={exportLogs ?? []} />
    </div>
  );
}
