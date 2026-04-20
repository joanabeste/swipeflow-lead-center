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
  isLeadInCrm,
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

/** Kontakt-Entwurf (noch ohne lead_id). */
interface ContactDraft {
  name: string;
  email: string | null;
  phone: string | null;
  source_url: string | null;
}

/**
 * Sammelt aus allen Zeilen einer Firma die EINDEUTIGEN Ansprechpartner.
 * Dedup-Key: email (lowercased) — falls email fehlt, fällt auf name (lowercased) zurück.
 * Erster Treffer gewinnt.
 *
 * Ergänzt als Fallback den aus der Beschreibung extrahierten Kontakt der
 * ersten Zeile, falls überhaupt kein Kontakt in den CSV-Spalten gesetzt ist.
 */
function dedupeContacts(
  listings: ParsedJobListing[],
  descFallback: { contactName: string | null; contactEmail: string | null; contactPhone: string | null },
): ContactDraft[] {
  const seen = new Map<string, ContactDraft>();

  for (const listing of listings) {
    const rawName = listing.contactName?.trim();
    if (!rawName) continue;
    const fullName = listing.salutation?.trim()
      ? `${listing.salutation.trim()} ${rawName}`.replace(/\s+/g, " ").trim()
      : rawName;
    const key = (listing.email ?? fullName).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.set(key, {
      name: fullName,
      email: listing.email,
      phone: listing.phone,
      source_url: listing.jobUrl,
    });
  }

  // Fallback: kein Kontakt in Spalten → versuche den aus der Beschreibung.
  if (seen.size === 0 && descFallback.contactName) {
    seen.set(descFallback.contactName.toLowerCase(), {
      name: descFallback.contactName,
      email: descFallback.contactEmail,
      phone: descFallback.contactPhone,
      source_url: listings[0]?.jobUrl ?? null,
    });
  }

  return Array.from(seen.values());
}

export async function processJobListingImport(fileContent: string): Promise<{
  success: boolean;
  imported: number;
  updated: number;
  alreadyInCrm: number;
  contacts: number;
  jobs: number;
  skipped: number;
  error?: string;
}> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, imported: 0, updated: 0, alreadyInCrm: 0, contacts: 0, jobs: 0, skipped: 0, error: "Nicht authentifiziert." };

  // CSV parsen
  const delimiter = detectDelimiter(fileContent);
  const { headers, rows } = parseCSV(fileContent, delimiter);

  // Limit-Check
  const sizeError = validateCsvSize(rows.length);
  if (sizeError) return { success: false, imported: 0, updated: 0, alreadyInCrm: 0, contacts: 0, jobs: 0, skipped: 0, error: sizeError.error };

  // Spalten-Mapping
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    const key = h.toLowerCase().trim();
    const mapped = COLUMN_MAP[key];
    if (mapped) colIndex[mapped] = i;
  });

  if (colIndex.company_name === undefined) {
    return { success: false, imported: 0, updated: 0, alreadyInCrm: 0, contacts: 0, jobs: 0, skipped: 0, error: "Spalte 'Kontakt' (Firmenname) nicht gefunden." };
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
    return { success: false, imported: 0, updated: 0, alreadyInCrm: 0, contacts: 0, jobs: 0, skipped: 0, error: e instanceof Error ? e.message : "Import-Log fehlgeschlagen" };
  }

  // Blacklist + Cancel-Rules + bestehende Leads — einmal laden
  const ctx = await loadImportContext(db);
  const { data: existingLeads } = await db
    .from("leads")
    .select("id, company_name, domain, status, crm_status_id");
  const leadIndex = buildLeadIndex(existingLeads ?? []);

  let imported = 0;
  let updated = 0;
  let alreadyInCrm = 0;
  let contactsCreated = 0;
  let jobsCreated = 0;
  let skipped = 0;

  // Sammelliste neue Leads für Batch-Insert
  interface PendingNewLead {
    company: ParsedJobListing;
    domain: string | null;
    descData: ReturnType<typeof analyzeJobDescription>;
    listings: ParsedJobListing[];
    contactDrafts: ContactDraft[];
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

    // Alle eindeutigen Ansprechpartner aus ALLEN Zeilen sammeln.
    const contactDrafts = dedupeContacts(companyListings, descData);

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
      // Lead ist schon da. Wenn er bereits im CRM liegt: Stammdaten NICHT
      // überschreiben (dort pflegt der Vertrieb manuell). Kontakte + Stellen
      // aus der neuen CSV werden trotzdem angehängt, damit keine Info verloren
      // geht — Dedup via Unique-Index bzw. Name/E-Mail-Check.
      const inCrm = isLeadInCrm(leadIndex, existingLeadId);

      if (inCrm) {
        alreadyInCrm++;
      } else {
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
      }

      // Kontakte + Jobs für bestehenden Lead direkt einfügen (mit DB-Dedup) —
      // gilt für CRM- und Nicht-CRM-Leads gleichermaßen.
      const { contacts: addedContacts, jobs: addedJobs } = await upsertContactsAndJobs(
        db,
        existingLeadId,
        contactDrafts,
        companyListings,
        descData,
      );
      contactsCreated += addedContacts;
      jobsCreated += addedJobs;
    } else {
      newLeads.push({ company: first, domain, descData, listings: companyListings, contactDrafts });
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
          const { contacts: c, jobs: j } = await upsertContactsAndJobs(
            db,
            row.id,
            newLeads[i].contactDrafts,
            newLeads[i].listings,
            newLeads[i].descData,
          );
          contactsCreated += c;
          jobsCreated += j;
        }
      }
    } else if (insertedRows) {
      imported = insertedRows.length;
      // Kontakte + Jobs in Batches anlegen (neue Leads → kein DB-Dedup nötig).
      const allContacts: Record<string, unknown>[] = [];
      const allJobs: Record<string, unknown>[] = [];
      for (let i = 0; i < insertedRows.length && i < newLeads.length; i++) {
        const leadId = insertedRows[i].id;
        const nl = newLeads[i];
        for (const contact of nl.contactDrafts) {
          allContacts.push({
            lead_id: leadId,
            name: contact.name,
            role: "Ansprechpartner",
            email: contact.email,
            phone: contact.phone,
            source_url: contact.source_url,
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
    details: { total: listings.length, imported, updated, alreadyInCrm, contacts: contactsCreated, jobs: jobsCreated, skipped },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return { success: true, imported, updated, alreadyInCrm, contacts: contactsCreated, jobs: jobsCreated, skipped };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Legt Kontakte + Job-Postings für einen (bestehenden oder neuen) Lead an.
 * Bei bestehenden Leads werden Kontakt-Duplikate per Name/E-Mail-Match vermieden.
 * Job-Postings sind durch den unique(lead_id, url)-Index abgesichert.
 */
async function upsertContactsAndJobs(
  db: ReturnType<typeof createServiceClient>,
  leadId: string,
  contactDrafts: ContactDraft[],
  companyListings: ParsedJobListing[],
  descData: ReturnType<typeof analyzeJobDescription>,
): Promise<{ contacts: number; jobs: number }> {
  let contactsAdded = 0;
  let jobsAdded = 0;

  if (contactDrafts.length > 0) {
    // Bestehende Kontakte für Dedup laden.
    const { data: existingContacts } = await db
      .from("lead_contacts")
      .select("name, email")
      .eq("lead_id", leadId);
    const existingKeys = new Set<string>();
    for (const c of existingContacts ?? []) {
      if (c.email) existingKeys.add(String(c.email).toLowerCase());
      if (c.name) existingKeys.add(String(c.name).toLowerCase().trim());
    }

    const toInsert = contactDrafts
      .filter((c) => {
        const emailKey = c.email?.toLowerCase();
        const nameKey = c.name.toLowerCase().trim();
        return !(emailKey && existingKeys.has(emailKey)) && !existingKeys.has(nameKey);
      })
      .map((c) => ({
        lead_id: leadId,
        name: c.name,
        role: "Ansprechpartner",
        email: c.email,
        phone: c.phone,
        source_url: c.source_url,
      }));

    if (toInsert.length > 0) {
      await db.from("lead_contacts").insert(toInsert);
      contactsAdded = toInsert.length;
    }
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
    const withUrl = jobsToInsert.filter((j) => j.url);
    const withoutUrl = jobsToInsert.filter((j) => !j.url);
    if (withUrl.length > 0) {
      await db.from("lead_job_postings").upsert(withUrl, { onConflict: "lead_id,url", ignoreDuplicates: true });
    }
    if (withoutUrl.length > 0) {
      await db.from("lead_job_postings").insert(withoutUrl);
    }
    jobsAdded = jobsToInsert.length;
  }

  return { contacts: contactsAdded, jobs: jobsAdded };
}
