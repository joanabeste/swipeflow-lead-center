"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseCSV, detectDelimiter, decodeBuffer } from "@/lib/csv/parser";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { analyzeJobDescription } from "@/lib/enrichment/job-description-analyzer";
import { isFuzzyMatch, normalizeDomain } from "@/lib/csv/dedup";
import { logAudit } from "@/lib/audit-log";
import type { BlacklistRule, BlacklistEntry, CancelRule } from "@/lib/types";
import { revalidatePath } from "next/cache";

// BA-Spalten Mapping
const COLUMN_MAP: Record<string, string> = {
  kontakt: "company_name",
  "gecrawlte e-mail": "email",
  anrede: "salutation",
  ansprechpartner: "contact_name",
  telefon: "phone",
  "webseite aus stellenanzeige": "career_page",
  "link zur stellenanzeige": "job_url",
  "veröffentlich am": "posted_date",
  "veröffentlicht am": "posted_date",
  stelle: "job_title",
  beschreibung: "description",
};

interface ParsedJobListing {
  companyName: string;
  email: string | null;
  salutation: string | null;
  contactName: string | null;
  phone: string | null;
  careerPage: string | null;
  jobUrl: string | null;
  postedDate: string | null;
  jobTitle: string | null;
  description: string | null;
}

export async function processJobListingImport(fileContent: string): Promise<{
  success: boolean;
  imported: number;
  updated: number;
  contacts: number;
  jobs: number;
  skipped: number;
  error?: string;
}> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, imported: 0, updated: 0, contacts: 0, jobs: 0, skipped: 0, error: "Nicht authentifiziert." };

  // CSV parsen
  const delimiter = detectDelimiter(fileContent);
  const { headers, rows } = parseCSV(fileContent, delimiter);

  // Spalten-Mapping
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = h.toLowerCase().trim();
    const mapped = COLUMN_MAP[key];
    if (mapped) colIndex[mapped] = i;
  });

  if (colIndex.company_name === undefined) {
    return { success: false, imported: 0, updated: 0, contacts: 0, jobs: 0, skipped: 0, error: "Spalte 'Kontakt' (Firmenname) nicht gefunden." };
  }

  // Zeilen parsen
  const listings: ParsedJobListing[] = rows
    .map((row) => ({
      companyName: row[colIndex.company_name]?.trim() ?? "",
      email: row[colIndex.email]?.trim() || null,
      salutation: row[colIndex.salutation]?.trim() || null,
      contactName: row[colIndex.contact_name]?.trim() || null,
      phone: row[colIndex.phone]?.trim() || null,
      careerPage: row[colIndex.career_page]?.trim() || null,
      jobUrl: row[colIndex.job_url]?.trim() || null,
      postedDate: row[colIndex.posted_date]?.trim() || null,
      jobTitle: row[colIndex.job_title]?.trim() || null,
      description: row[colIndex.description]?.trim() || null,
    }))
    .filter((l) => l.companyName.length > 0);

  // Nach Firma gruppieren
  const grouped = new Map<string, ParsedJobListing[]>();
  for (const listing of listings) {
    const key = listing.companyName.toLowerCase();
    const existing = grouped.get(key) ?? [];
    existing.push(listing);
    grouped.set(key, existing);
  }

  // Import-Log erstellen
  const { data: importLog } = await db
    .from("import_logs")
    .insert({
      file_name: "stellenanzeigen-import",
      file_path: "",
      row_count: listings.length,
      import_type: "job_listing",
      status: "processing",
      created_by: user.id,
    })
    .select()
    .single();

  // Blacklist + Cancel-Rules laden
  const [{ data: rules }, { data: entries }, { data: cancelRules }] = await Promise.all([
    db.from("blacklist_rules").select("*").eq("is_active", true),
    db.from("blacklist_entries").select("*"),
    db.from("cancel_rules").select("*").eq("is_active", true),
  ]);

  // Bestehende Leads laden für Duplikat-Check
  const { data: existingLeads } = await db
    .from("leads")
    .select("id, company_name, domain, city");

  let imported = 0;
  let updated = 0;
  let contactsCreated = 0;
  let jobsCreated = 0;
  let skipped = 0;

  for (const [, companyListings] of grouped) {
    const first = companyListings[0];

    // Domain aus Website extrahieren
    let domain: string | null = null;
    if (first.careerPage) {
      try {
        const url = new URL(first.careerPage.startsWith("http") ? first.careerPage : `https://${first.careerPage}`);
        domain = url.hostname.replace(/^www\./, "");
      } catch { /* ignore */ }
    }

    // Beschreibung analysieren (Regex-basiert, kein API-Call)
    const descData = analyzeJobDescription(first.description ?? "");

    // Blacklist-Check
    const leadData: Record<string, string | null> = {
      company_name: first.companyName,
      domain,
      email: first.email,
    };
    const blacklistResult = checkLead(leadData, (rules as BlacklistRule[]) ?? [], (entries as BlacklistEntry[]) ?? []);
    if (blacklistResult.blocked) {
      skipped++;
      continue;
    }

    // Cancel-Rules Check
    const cancelResult = evaluateCancelRules(leadData as Record<string, unknown>, (cancelRules as CancelRule[]) ?? [], "import");
    if (cancelResult.cancelled) {
      skipped++;
      continue;
    }

    // Duplikat-Check: Bestehenden Lead finden
    let existingLeadId: string | null = null;
    if (existingLeads) {
      for (const existing of existingLeads) {
        if (domain && existing.domain && normalizeDomain(domain) === normalizeDomain(existing.domain)) {
          existingLeadId = existing.id;
          break;
        }
        if (isFuzzyMatch(first.companyName, existing.company_name)) {
          existingLeadId = existing.id;
          break;
        }
      }
    }

    let leadId: string;

    if (existingLeadId) {
      // Bestehenden Lead aktualisieren (leere Felder ergänzen)
      const updates: Record<string, unknown> = {};
      const { data: existingLead } = await db.from("leads").select("*").eq("id", existingLeadId).single();
      if (existingLead) {
        if (!existingLead.email && first.email) updates.email = first.email;
        if (!existingLead.phone && first.phone) updates.phone = first.phone;
        if (!existingLead.domain && domain) updates.domain = domain;
        if (!existingLead.website && first.careerPage) updates.website = first.careerPage;
        if (!existingLead.city && descData.city) updates.city = descData.city;
        if (!existingLead.zip && descData.zip) updates.zip = descData.zip;
        if (!existingLead.street && descData.street) updates.street = descData.street;
        if (!existingLead.company_size && descData.companySize) updates.company_size = descData.companySize;

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await db.from("leads").update(updates).eq("id", existingLeadId);
          updated++;
        }
      }
      leadId = existingLeadId;
    } else {
      // Neuen Lead erstellen
      const { data: newLead } = await db
        .from("leads")
        .insert({
          company_name: first.companyName,
          email: first.email,
          phone: first.phone,
          domain,
          website: first.careerPage,
          city: descData.city,
          zip: descData.zip,
          street: descData.street,
          company_size: descData.companySize,
          country: "Deutschland",
          source_type: "csv",
          source_import_id: importLog?.id,
          status: "imported",
          created_by: user.id,
        })
        .select()
        .single();

      if (!newLead) continue;
      leadId = newLead.id;
      imported++;
    }

    // Kontakt erstellen (wenn Ansprechpartner vorhanden)
    const contactName = first.contactName?.trim() || descData.contactName;
    if (contactName) {
      const fullName = first.salutation ? `${first.salutation} ${contactName}`.trim() : contactName;
      await db.from("lead_contacts").insert({
        lead_id: leadId,
        name: fullName,
        role: "Ansprechpartner",
        email: first.email ?? descData.contactEmail,
        phone: first.phone ?? descData.contactPhone,
        source_url: first.jobUrl,
      });
      contactsCreated++;
    }

    // Job-Postings erstellen (alle Stellen dieser Firma)
    for (const listing of companyListings) {
      if (listing.jobTitle) {
        await db.from("lead_job_postings").insert({
          lead_id: leadId,
          title: listing.jobTitle,
          url: listing.jobUrl,
          location: descData.city,
          posted_date: listing.postedDate,
        });
        jobsCreated++;
      }
    }
  }

  // Import-Log abschließen
  await db
    .from("import_logs")
    .update({
      imported_count: imported,
      updated_count: updated,
      skipped_count: skipped,
      status: "completed",
    })
    .eq("id", importLog?.id);

  await logAudit({
    userId: user.id,
    action: "import.job_listings",
    entityType: "import_log",
    entityId: importLog?.id,
    details: { total: listings.length, imported, updated, contacts: contactsCreated, jobs: jobsCreated, skipped },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return { success: true, imported, updated, contacts: contactsCreated, jobs: jobsCreated, skipped };
}
