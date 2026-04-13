"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import { isFuzzyMatch, normalizeDomain } from "@/lib/csv/dedup";
import { GOOGLE_MAPS_COLUMNS } from "@/lib/csv/format-detector";
import { logAudit } from "@/lib/audit-log";
import type { BlacklistRule, BlacklistEntry, CancelRule } from "@/lib/types";
import { revalidatePath } from "next/cache";

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

  // Import-Log
  const { data: importLog } = await db
    .from("import_logs")
    .insert({
      file_name: "google-maps-import",
      file_path: "",
      row_count: validRows.length,
      import_type: "csv",
      status: "processing",
      created_by: user.id,
    })
    .select()
    .single();

  // Blacklist + Cancel-Rules
  const [{ data: rules }, { data: entries }, { data: cancelRules }] = await Promise.all([
    db.from("blacklist_rules").select("*").eq("is_active", true),
    db.from("blacklist_entries").select("*"),
    db.from("cancel_rules").select("*").eq("is_active", true),
  ]);

  // Bestehende Leads
  const { data: existingLeads } = await db
    .from("leads")
    .select("id, company_name, domain, city");

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  // Mojibake fixen
  function fix(s: string | undefined): string {
    if (!s) return "";
    return s
      .replace(/Ã¤/g, "ä").replace(/Ã¶/g, "ö").replace(/Ã¼/g, "ü")
      .replace(/Ã„/g, "Ä").replace(/Ã–/g, "Ö").replace(/Ãœ/g, "Ü")
      .replace(/ÃŸ/g, "ß").replace(/Â·/g, "").replace(/Â­/g, "")
      .replace(/Â /g, " ").trim();
  }

  for (const row of validRows) {
    const companyName = fix(row[col.companyName]);
    const phone = fix(row[col.phone]);
    const websiteRaw = row[col.website]?.trim() ?? "";
    const category = fix(row[col.category]);
    const address = fix(row[col.address]);
    const rating = row[col.rating]?.replace(",", ".")?.trim();

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

    // Blacklist
    const leadData: Record<string, string | null> = { company_name: companyName, domain, phone };
    const blacklistResult = checkLead(leadData, (rules as BlacklistRule[]) ?? [], (entries as BlacklistEntry[]) ?? []);
    if (blacklistResult.blocked) { skipped++; continue; }

    // Cancel-Rules
    const cancelResult = evaluateCancelRules(leadData as Record<string, unknown>, (cancelRules as CancelRule[]) ?? [], "import");
    if (cancelResult.cancelled) { skipped++; continue; }

    // Duplikat-Check
    let existingId: string | null = null;
    if (existingLeads) {
      for (const ex of existingLeads) {
        if (domain && ex.domain && normalizeDomain(domain) === normalizeDomain(ex.domain)) { existingId = ex.id; break; }
        if (isFuzzyMatch(companyName, ex.company_name)) { existingId = ex.id; break; }
      }
    }

    if (existingId) {
      // Update leere Felder
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
      await db.from("leads").insert({
        company_name: companyName,
        phone,
        domain,
        website,
        industry: category || null,
        street: address || null,
        country: "Deutschland",
        source_type: "csv",
        source_import_id: importLog?.id,
        status: "imported",
        created_by: user.id,
      });
      imported++;
    }
  }

  await db.from("import_logs").update({
    imported_count: imported,
    updated_count: updated,
    skipped_count: skipped,
    status: "completed",
  }).eq("id", importLog?.id);

  await logAudit({
    userId: user.id,
    action: "import.google_maps",
    entityType: "import_log",
    entityId: importLog?.id,
    details: { total: validRows.length, imported, updated, skipped },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return { success: true, imported, updated, skipped };
}
