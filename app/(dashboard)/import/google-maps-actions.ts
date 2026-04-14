"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { GOOGLE_MAPS_COLUMNS } from "@/lib/csv/format-detector";
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

// Mojibake-Fix für Google-Maps-Exports
function fixMojibake(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/Ã¤/g, "ä").replace(/Ã¶/g, "ö").replace(/Ã¼/g, "ü")
    .replace(/Ã„/g, "Ä").replace(/Ã–/g, "Ö").replace(/Ãœ/g, "Ü")
    .replace(/ÃŸ/g, "ß").replace(/Â·/g, "").replace(/Â­/g, "")
    .replace(/Â /g, " ").trim();
}

export async function processGoogleMapsImport(rows: string[][]): Promise<{
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  error?: string;
}> {
  const supabase = await createClient();
  const db = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, imported: 0, updated: 0, skipped: 0, error: "Nicht authentifiziert." };

  const col = GOOGLE_MAPS_COLUMNS;

  // Valide Zeilen filtern (müssen Firmenname haben)
  const validRows = rows.filter((r) => r[col.companyName]?.trim());

  // Limit-Check
  const sizeError = validateCsvSize(validRows.length);
  if (sizeError) return { success: false, imported: 0, updated: 0, skipped: 0, error: sizeError.error };

  // Import-Log (wirft bei Fehler)
  let importLog;
  try {
    importLog = await createImportLog(db, {
      fileName: "google-maps-import",
      rowCount: validRows.length,
      importType: "google_maps",
      userId: user.id,
    });
  } catch (e) {
    return { success: false, imported: 0, updated: 0, skipped: 0, error: e instanceof Error ? e.message : "Import-Log fehlgeschlagen" };
  }

  // Blacklist + Cancel-Rules + Lead-Index
  const ctx = await loadImportContext(db);
  const { data: existingLeads } = await db
    .from("leads")
    .select("id, company_name, domain");
  const leadIndex = buildLeadIndex(existingLeads ?? []);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  // Sammelliste neue Leads für Batch-Insert
  const newLeads: Record<string, unknown>[] = [];

  for (const row of validRows) {
    const companyName = sanitizeCellValue(fixMojibake(row[col.companyName])) ?? "";
    const phone = sanitizeCellValue(fixMojibake(row[col.phone]));
    const websiteRaw = row[col.website]?.trim() ?? "";
    const category = sanitizeCellValue(fixMojibake(row[col.category]));
    const address = sanitizeCellValue(fixMojibake(row[col.address]));

    // Website bereinigen (Google Ads Links ausfiltern)
    const website = websiteRaw.includes("google.com/aclk") ? null : websiteRaw || null;

    // Domain extrahieren
    let domain: string | null = null;
    if (website) {
      try {
        const url = new URL(website.startsWith("http") ? website : `https://${website}`);
        domain = url.hostname.replace(/^www\./, "");
      } catch { /* ignore */ }
    }

    // Blacklist + Cancel
    const leadData: Record<string, string | null> = { company_name: companyName, domain, phone };
    if (checkLead(leadData, ctx.rules, ctx.entries).blocked) { skipped++; continue; }
    if (evaluateCancelRules(leadData as Record<string, unknown>, ctx.cancelRules, "import").cancelled) { skipped++; continue; }

    // O(1)/O(n) Duplikat-Check
    const existingId = findMatchingLead(leadIndex, domain, companyName);

    if (existingId) {
      const { data: existingLead } = await db.from("leads").select("*").eq("id", existingId).single();
      if (existingLead) {
        const updates: Record<string, unknown> = {};
        if (!existingLead.phone && phone) updates.phone = phone;
        if (!existingLead.domain && domain) updates.domain = domain;
        if (!existingLead.website && website) updates.website = website;
        if (!existingLead.industry && category) updates.industry = category;
        if (!existingLead.street && address) updates.street = address;
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
        industry: category || null,
        street: address || null,
        country: "Deutschland",
        source_type: "csv",
        source_import_id: importLog.id,
        status: "imported",
        created_by: user.id,
      });
    }
  }

  // Batch-Insert neue Leads
  if (newLeads.length > 0) {
    const result = await batchInsert(db, "leads", newLeads);
    imported = result.inserted;
  }

  await finalizeImportLog(db, importLog.id, {
    imported,
    updated,
    skipped,
  });

  await logAudit({
    userId: user.id,
    action: "import.google_maps",
    entityType: "import_log",
    entityId: importLog.id,
    details: { total: validRows.length, imported, updated, skipped },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return { success: true, imported, updated, skipped };
}
