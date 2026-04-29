"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { INSTANT_SCRAPER_COLUMNS } from "@/lib/csv/format-detector";
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
  fixMojibake,
  extractWebsiteAndDomain,
  parseCityZipFromMapsUrl,
  looksLikePhone,
  looksLikeUrl,
} from "@/lib/csv/import-helpers";

type InstantScraperResult = {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  error?: string;
};

export async function processInstantScraperImport(
  rows: string[][],
  headers: string[],
  vertical: "webdesign" | "recruiting" | null,
): Promise<InstantScraperResult> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, imported: 0, updated: 0, skipped: 0, error: "Nicht authentifiziert." };
  }

  // Header → Index. Trim, weil Instant-Data-Scraper teilweise Whitespace anhängt.
  const findCol = (name: string) => headers.findIndex((h) => h.trim() === name);
  const cName = findCol(INSTANT_SCRAPER_COLUMNS.companyName);
  const cCategory = findCol(INSTANT_SCRAPER_COLUMNS.category);
  const cAddressPhone = findCol(INSTANT_SCRAPER_COLUMNS.addressPhone);
  const cWebsite = findCol(INSTANT_SCRAPER_COLUMNS.website);
  const cMapsUrl = findCol(INSTANT_SCRAPER_COLUMNS.mapsUrl);

  if (cName === -1) {
    return {
      success: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      error: `Spalte "${INSTANT_SCRAPER_COLUMNS.companyName}" nicht gefunden — kein Instant-Data-Scraper-Export?`,
    };
  }

  const validRows = rows.filter((r) => r[cName]?.trim());

  const sizeError = validateCsvSize(validRows.length);
  if (sizeError) {
    return { success: false, imported: 0, updated: 0, skipped: 0, error: sizeError.error };
  }

  let importLog;
  try {
    importLog = await createImportLog(db, {
      fileName: "instant-scraper-import",
      rowCount: validRows.length,
      importType: "instant_scraper",
      userId: user.id,
    });
  } catch (e) {
    return {
      success: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      error: e instanceof Error ? e.message : "Import-Log fehlgeschlagen",
    };
  }

  const ctx = await loadImportContext(db);
  const { data: existingLeads } = await db.from("leads").select("id, company_name, domain");
  const leadIndex = buildLeadIndex(existingLeads ?? []);

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const newLeads: Record<string, unknown>[] = [];

  for (const row of validRows) {
    const companyName = sanitizeCellValue(fixMojibake(row[cName])) ?? "";
    if (!companyName) { skipped++; continue; }

    // Kategorie kommt mit "· "-Prefix: "· Ergotherapeut" → "Ergotherapeut"
    const categoryRaw = fixMojibake(cCategory >= 0 ? row[cCategory] : "");
    const industry = sanitizeCellValue(categoryRaw.replace(/^[·\s]+/, ""));

    // "Straße · Telefon" am ERSTEN "·" splitten — aber jeder Teil kann auch URL,
    // Telefon oder Adresse sein. Wir klassifizieren beide Teile heuristisch.
    const addrPhone = fixMojibake(cAddressPhone >= 0 ? row[cAddressPhone] : "");
    const segments = addrPhone
      .split("·")
      .map((s) => s.trim())
      .filter(Boolean);

    let street: string | null = null;
    let phone: string | null = null;
    let websiteFromAddrPhone: string | null = null;
    for (const seg of segments) {
      if (looksLikePhone(seg)) {
        if (!phone) phone = seg;
      } else if (looksLikeUrl(seg)) {
        if (!websiteFromAddrPhone) websiteFromAddrPhone = seg;
      } else if (!street) {
        street = seg;
      }
    }
    street = sanitizeCellValue(street);
    phone = sanitizeCellValue(phone);

    // Website primär aus eigener Spalte, Fallback aus addrPhone
    const websiteRaw = cWebsite >= 0 ? row[cWebsite] : null;
    const websitePrimary = extractWebsiteAndDomain(websiteRaw);
    const { website, domain } = websitePrimary.domain
      ? websitePrimary
      : extractWebsiteAndDomain(websiteFromAddrPhone);

    const mapsUrl = (cMapsUrl >= 0 ? row[cMapsUrl]?.trim() : "") || null;
    const { city, zip } = parseCityZipFromMapsUrl(mapsUrl);

    const leadData: Record<string, string | null> = { company_name: companyName, domain, phone };
    if (checkLead(leadData, ctx.rules, ctx.entries).blocked) { skipped++; continue; }
    if (evaluateCancelRules(leadData as Record<string, unknown>, ctx.cancelRules, "import").cancelled) {
      skipped++;
      continue;
    }

    const existingId = findMatchingLead(leadIndex, domain, companyName);

    if (existingId) {
      const { data: existingLead } = await db.from("leads").select("*").eq("id", existingId).single();
      if (existingLead) {
        const updates: Record<string, unknown> = {};
        if (!existingLead.phone && phone) updates.phone = phone;
        if (!existingLead.domain && domain) updates.domain = domain;
        if (!existingLead.website && website) updates.website = website;
        if (!existingLead.industry && industry) updates.industry = industry;
        if (!existingLead.street && street) updates.street = street;
        if (!existingLead.city && city) updates.city = city;
        if (!existingLead.zip && zip) updates.zip = zip;
        if (!existingLead.source_url && mapsUrl) updates.source_url = mapsUrl;
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await db.from("leads").update(updates).eq("id", existingId);
          updated++;
        }
      }
    } else {
      newLeads.push({
        company_name: companyName,
        phone,
        domain,
        website,
        industry,
        street,
        city,
        zip,
        country: "Deutschland",
        vertical,
        source_type: "csv",
        source_import_id: importLog.id,
        source_url: mapsUrl,
        status: "imported",
        created_by: user.id,
      });
    }
  }

  if (newLeads.length > 0) {
    const result = await batchInsert(db, "leads", newLeads);
    imported = result.inserted;
  }

  await finalizeImportLog(db, importLog.id, { imported, updated, skipped });

  await logAudit({
    userId: user.id,
    action: "import.instant_scraper",
    entityType: "import_log",
    entityId: importLog.id,
    details: { total: validRows.length, imported, updated, skipped },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return { success: true, imported, updated, skipped };
}
