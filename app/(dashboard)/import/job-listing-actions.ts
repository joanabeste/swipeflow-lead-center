"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseCSV, detectDelimiter } from "@/lib/csv/parser";
import { normalizePhone } from "@/lib/csv/normalizer";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { analyzeJobDescription } from "@/lib/enrichment/job-description-analyzer";
import { logAudit } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";
import {
  validateCsvSize,
  sanitizeCellValue,
  loadImportContext,
  buildLeadIndex,
  findMatchingLead,
  createImportLog,
  finalizeImportLog,
  batchInsert,
} from "@/lib/csv/import-helpers";

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

  // Limit-Check
  const sizeError = validateCsvSize(rows.length);
  if (sizeError) return { success: false, imported: 0, updated: 0, contacts: 0, jobs: 0, skipped: 0, error: sizeError.error };

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

  // Zeilen parsen + sanitizen
  const listings: ParsedJobListing[] = rows
    .map((row) => ({
      companyName: sanitizeCellValue(row[colIndex.company_name]) ?? "",
      email: sanitizeCellValue(row[colIndex.email]),
      salutation: sanitizeCellValue(row[colIndex.salutation]),
      contactName: sanitizeCellValue(row[colIndex.contact_name]),
      phone: normalizePhone(sanitizeCellValue(row[colIndex.phone])),
      careerPage: sanitizeCellValue(row[colIndex.career_page]),
      jobUrl: sanitizeCellValue(row[colIndex.job_url]),
      postedDate: sanitizeCellValue(row[colIndex.posted_date]),
      jobTitle: sanitizeCellValue(row[colIndex.job_title]),
      description: sanitizeCellValue(row[colIndex.description]),
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

  // Import-Log (wirft bei Fehler)
  let importLog;
  try {
    importLog = await createImportLog(db, {
      fileName: "stellenanzeigen-import",
      rowCount: listings.length,
      importType: "ba_job_listing",
      userId: user.id,
    });
  } catch (e) {
    return { success: false, imported: 0, updated: 0, contacts: 0, jobs: 0, skipped: 0, error: e instanceof Error ? e.message : "Import-Log fehlgeschlagen" };
  }

  // Blacklist + Cancel-Rules + bestehende Leads — einmal laden
  const ctx = await loadImportContext(db);
  const { data: existingLeads } = await db
    .from("leads")
    .select("id, company_name, domain");
  const leadIndex = buildLeadIndex(existingLeads ?? []);

  let imported = 0;
  let updated = 0;
  let contactsCreated = 0;
  let jobsCreated = 0;
  let skipped = 0;

  // Sammelliste neue Leads für Batch-Insert
  interface PendingNewLead {
    company: ParsedJobListing;
    domain: string | null;
    descData: ReturnType<typeof analyzeJobDescription>;
    listings: ParsedJobListing[];
  }
  const newLeads: PendingNewLead[] = [];

  // Phase 1: Updates auf bestehende Leads sofort, neue Leads sammeln
  for (const [, companyListings] of grouped) {
    const first = companyListings[0];

    // Domain extrahieren
    let domain: string | null = null;
    if (first.careerPage) {
      try {
        const url = new URL(first.careerPage.startsWith("http") ? first.careerPage : `https://${first.careerPage}`);
        domain = url.hostname.replace(/^www\./, "");
      } catch { /* ignore */ }
    }

    // Beschreibung analysieren (Regex, keine API)
    const descData = analyzeJobDescription(first.description ?? "");

    // Blacklist + Cancel-Rules
    const leadData: Record<string, string | null> = {
      company_name: first.companyName,
      domain,
      email: first.email,
    };
    if (checkLead(leadData, ctx.rules, ctx.entries).blocked) { skipped++; continue; }
    if (evaluateCancelRules(leadData as Record<string, unknown>, ctx.cancelRules, "import").cancelled) { skipped++; continue; }

    // Duplikat-Check via O(1)/O(n) Index
    const existingLeadId = findMatchingLead(leadIndex, domain, first.companyName);

    if (existingLeadId) {
      // Update bestehender Lead — nur leere Felder ergänzen
      const { data: existingLead } = await db.from("leads").select("*").eq("id", existingLeadId).single();
      if (existingLead) {
        const updates: Record<string, unknown> = {};
        if (!existingLead.email && first.email) updates.email = first.email;
        if (!existingLead.phone && first.phone) updates.phone = first.phone;
        if (!existingLead.domain && domain) updates.domain = domain;
        if (!existingLead.website && domain) updates.website = `https://${domain}`;
        if (!existingLead.career_page_url && first.careerPage) updates.career_page_url = first.careerPage;
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

      // Kontakt + Jobs für bestehenden Lead direkt einfügen
      await createContactsAndJobs(db, existingLeadId, first, descData, companyListings);
      contactsCreated += contactCountFor(first, descData);
      jobsCreated += companyListings.filter((l) => l.jobTitle).length;
    } else {
      newLeads.push({ company: first, domain, descData, listings: companyListings });
    }
  }

  // Phase 2: Neue Leads im Batch anlegen
  if (newLeads.length > 0) {
    const insertPayload = newLeads.map((nl) => ({
      company_name: nl.company.companyName,
      email: nl.company.email,
      phone: nl.company.phone,
      domain: nl.domain,
      website: nl.domain ? `https://${nl.domain}` : null,
      career_page_url: nl.company.careerPage,
      city: nl.descData.city,
      zip: nl.descData.zip,
      street: nl.descData.street,
      company_size: nl.descData.companySize,
      country: "Deutschland",
      source_type: "csv",
      source_import_id: importLog.id,
      status: "imported",
      created_by: user.id,
    }));

    // Batch-Insert mit Returning
    const { data: insertedRows, error } = await db
      .from("leads")
      .insert(insertPayload)
      .select("id, company_name");

    if (error) {
      // Fallback: einzeln einfügen, damit ein einzelner Konflikt nicht alles killt
      for (let i = 0; i < newLeads.length; i++) {
        const { data: row } = await db.from("leads").insert(insertPayload[i]).select("id").single();
        if (row) {
          imported++;
          await createContactsAndJobs(db, row.id, newLeads[i].company, newLeads[i].descData, newLeads[i].listings);
          contactsCreated += contactCountFor(newLeads[i].company, newLeads[i].descData);
          jobsCreated += newLeads[i].listings.filter((l) => l.jobTitle).length;
        }
      }
    } else if (insertedRows) {
      imported = insertedRows.length;
      // Kontakte + Jobs in Batches anlegen
      const allContacts: Record<string, unknown>[] = [];
      const allJobs: Record<string, unknown>[] = [];
      for (let i = 0; i < insertedRows.length && i < newLeads.length; i++) {
        const leadId = insertedRows[i].id;
        const nl = newLeads[i];
        const contactName = nl.company.contactName?.trim() || nl.descData.contactName;
        if (contactName) {
          const fullName = nl.company.salutation ? `${nl.company.salutation} ${contactName}`.trim() : contactName;
          allContacts.push({
            lead_id: leadId,
            name: fullName,
            role: "Ansprechpartner",
            email: nl.company.email ?? nl.descData.contactEmail,
            phone: nl.company.phone ?? nl.descData.contactPhone,
            source_url: nl.company.jobUrl,
          });
          contactsCreated++;
        }
        for (const listing of nl.listings) {
          if (listing.jobTitle) {
            allJobs.push({
              lead_id: leadId,
              title: listing.jobTitle,
              url: listing.jobUrl,
              location: nl.descData.city,
              posted_date: listing.postedDate,
              source: "ba_import",
            });
            jobsCreated++;
          }
        }
      }
      if (allContacts.length > 0) await batchInsert(db, "lead_contacts", allContacts);
      if (allJobs.length > 0) await batchInsert(db, "lead_job_postings", allJobs);
    }
  }

  // Import-Log abschließen
  await finalizeImportLog(db, importLog.id, {
    imported,
    updated,
    skipped,
  });

  await logAudit({
    userId: user.id,
    action: "import.job_listings",
    entityType: "import_log",
    entityId: importLog.id,
    details: { total: listings.length, imported, updated, contacts: contactsCreated, jobs: jobsCreated, skipped },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return { success: true, imported, updated, contacts: contactsCreated, jobs: jobsCreated, skipped };
}

// ─── Helpers ────────────────────────────────────────────────

function contactCountFor(c: ParsedJobListing, d: ReturnType<typeof analyzeJobDescription>): number {
  return c.contactName?.trim() || d.contactName ? 1 : 0;
}

async function createContactsAndJobs(
  db: ReturnType<typeof createServiceClient>,
  leadId: string,
  first: ParsedJobListing,
  descData: ReturnType<typeof analyzeJobDescription>,
  companyListings: ParsedJobListing[],
): Promise<void> {
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
  }

  const jobsToInsert = companyListings
    .filter((l) => l.jobTitle)
    .map((listing) => ({
      lead_id: leadId,
      title: listing.jobTitle,
      url: listing.jobUrl,
      location: descData.city,
      posted_date: listing.postedDate,
      source: "ba_import" as const,
    }));
  if (jobsToInsert.length > 0) {
    // Mit URL: upsert wegen Unique-Index; ohne URL: regulärer insert
    const withUrl = jobsToInsert.filter((j) => j.url);
    const withoutUrl = jobsToInsert.filter((j) => !j.url);
    if (withUrl.length > 0) {
      await db.from("lead_job_postings").upsert(withUrl, { onConflict: "lead_id,url", ignoreDuplicates: true });
    }
    if (withoutUrl.length > 0) {
      await db.from("lead_job_postings").insert(withoutUrl);
    }
  }
}
