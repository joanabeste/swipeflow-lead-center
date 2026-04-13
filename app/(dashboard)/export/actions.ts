"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  createHubSpotCompany,
  searchHubSpotCompany,
  createHubSpotContact,
  createHubSpotNote,
  splitName,
} from "@/lib/hubspot/client";
import { logAudit } from "@/lib/audit-log";

export async function exportLead(leadId: string, hsLeadStatus: string = "MANUELLE_UEBERPRUEFUNG") {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: lead } = await db
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (!lead) return { error: "Lead nicht gefunden." };
  if (lead.status !== "qualified") return { error: "Lead ist nicht qualifiziert." };

  const token = process.env.HUBSPOT_API_TOKEN;
  if (!token) return { error: "HubSpot API Token nicht konfiguriert." };

  // Duplikat-Check in HubSpot
  if (lead.domain) {
    const existing = await searchHubSpotCompany(token, lead.domain);
    if (existing) {
      await db.from("export_logs").insert({
        lead_id: leadId,
        hubspot_company_id: existing.id,
        status: "duplicate",
        created_by: user?.id ?? null,
      });
      return { error: `Firma existiert bereits in HubSpot (ID: ${existing.id}).`, duplicate: true };
    }
  }

  try {
    // 1. Company erstellen
    const result = await createHubSpotCompany(token, {
      name: lead.company_name,
      domain: lead.domain ?? "",
      phone: lead.phone ?? "",
      city: lead.city ?? "",
      zip: lead.zip ?? "",
      address: lead.street ?? "",
      state: lead.state ?? "",
      country: lead.country ?? "",
      industry: lead.industry ?? "",
      website: lead.website ?? "",
      description: lead.description ?? "",
      hs_lead_status: hsLeadStatus,
      numberofemployees: lead.company_size ?? "",
    });

    const hubspotId = result.id;

    // 2. Kontakte erstellen und mit Company verknüpfen
    const { data: contacts } = await db
      .from("lead_contacts")
      .select("*")
      .eq("lead_id", leadId);

    let contactsExported = 0;
    if (contacts && contacts.length > 0) {
      for (const contact of contacts) {
        const { firstname, lastname } = splitName(contact.name);
        const created = await createHubSpotContact(token, hubspotId, {
          firstname,
          lastname,
          email: contact.email ?? undefined,
          phone: contact.phone ?? undefined,
          jobtitle: contact.role ?? undefined,
        });
        if (created) contactsExported++;
      }
    }

    // 3. Stellenanzeigen als Notiz
    const { data: jobPostings } = await db
      .from("lead_job_postings")
      .select("*")
      .eq("lead_id", leadId);

    if (jobPostings && jobPostings.length > 0) {
      const jobLines = jobPostings.map((j) => {
        let line = `• ${j.title}`;
        if (j.location) line += ` — ${j.location}`;
        if (j.url) line += `\n  ${j.url}`;
        return line;
      });

      // Karriereseite hinzufügen
      const { data: enrichment } = await db
        .from("lead_enrichments")
        .select("career_page_url")
        .eq("lead_id", leadId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      let noteBody = `Offene Stellen (${jobPostings.length}):\n\n${jobLines.join("\n\n")}`;
      if (enrichment?.career_page_url) {
        noteBody += `\n\nKarriereseite: ${enrichment.career_page_url}`;
      }
      noteBody += `\n\n— Exportiert aus Lead Center am ${new Date().toLocaleDateString("de-DE")}`;

      await createHubSpotNote(token, hubspotId, noteBody);
    }

    // 4. Lead aktualisieren
    await db
      .from("leads")
      .update({
        status: "exported",
        hubspot_company_id: hubspotId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    await db.from("export_logs").insert({
      lead_id: leadId,
      hubspot_company_id: hubspotId,
      status: "success",
      response_data: result,
      created_by: user?.id ?? null,
    });

    await logAudit({
      userId: user?.id ?? null,
      action: "export.success",
      entityType: "lead",
      entityId: leadId,
      details: {
        hubspot_company_id: hubspotId,
        contacts_exported: contactsExported,
        jobs_exported: jobPostings?.length ?? 0,
      },
    });

    revalidatePath("/leads");
    revalidatePath("/export");
    return { success: true, hubspotId };
  } catch (e) {
    await db.from("export_logs").insert({
      lead_id: leadId,
      status: "failed",
      error_message: (e as Error).message,
      created_by: user?.id ?? null,
    });
    return { error: (e as Error).message };
  }
}

export async function batchExport(leadIds: string[], hsLeadStatus: string = "MANUELLE_UEBERPRUEFUNG") {
  let successCount = 0;
  let errorCount = 0;

  for (const id of leadIds) {
    const result = await exportLead(id, hsLeadStatus);
    if (result.success) {
      successCount++;
    } else {
      errorCount++;
    }
    // Rate-Limiting: max ~10 req/s
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  revalidatePath("/leads");
  revalidatePath("/export");
  return { successCount, errorCount };
}
