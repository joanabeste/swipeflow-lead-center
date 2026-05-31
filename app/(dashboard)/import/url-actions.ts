"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { enrichLead } from "@/lib/enrichment/enrich-lead";
import { fetchCompanyPages } from "@/lib/enrichment/web-fetcher";
import { safeFetch } from "@/lib/net/safe-fetch";
import { extractCompaniesFromPage } from "@/lib/enrichment/directory-extractor";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import {
  loadExistingLeadsIndex,
  findDbDuplicateForLead,
  findInternalDuplicates,
  addLeadToIndex,
} from "@/lib/csv/dedup";
import type { BlacklistEntry, BlacklistRule, CancelRule } from "@/lib/types";
import { revalidatePath } from "next/cache";

// Felder, die beim Merge eines Duplikats nur gefuellt werden, wenn sie noch leer sind.
const MERGE_UPDATE_FIELDS = [
  "website", "phone", "email", "street", "city", "zip", "state",
  "country", "industry", "company_size", "legal_form", "register_id",
  "description",
] as const;

/** Fuellt fehlende Felder eines bestehenden Leads aus neuen Werten und protokolliert
 *  die Aenderungen in lead_changes. Gibt zurueck, ob etwas aktualisiert wurde. */
async function mergeIntoExistingLead(
  db: ReturnType<typeof createServiceClient>,
  existingLeadId: string,
  newValues: Record<string, string | null>,
  userId: string | null,
): Promise<boolean> {
  const { data: existingLead } = await db
    .from("leads")
    .select("*")
    .eq("id", existingLeadId)
    .single();
  if (!existingLead) return false;

  const updates: Record<string, string | null> = {};
  for (const field of MERGE_UPDATE_FIELDS) {
    const newVal = newValues[field];
    const oldVal = existingLead[field as keyof typeof existingLead] as string | null;
    if (newVal && !oldVal) updates[field] = newVal;
  }
  if (Object.keys(updates).length === 0) return false;

  updates.updated_at = new Date().toISOString();
  await db.from("leads").update(updates).eq("id", existingLeadId);

  const changes = Object.entries(updates)
    .filter(([k]) => k !== "updated_at")
    .map(([k, v]) => ({
      lead_id: existingLeadId,
      user_id: userId,
      field_name: k,
      old_value: null,
      new_value: v,
    }));
  if (changes.length > 0) await db.from("lead_changes").insert(changes);
  return true;
}


// ============================================================
// Einzelne Firmen-URL importieren
// ============================================================

export async function importFromUrl(url: string): Promise<{
  success: boolean;
  leadId?: string;
  companyName?: string;
  duplicate?: boolean;
  updated?: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Nicht authentifiziert." };

  const db = createServiceClient();

  try {
    // 1. Homepage abrufen und Firmennamen extrahieren
    const { pages } = await fetchCompanyPages(url);
    const homepage = pages.find((p) => p.category === "homepage" && !p.error);

    let companyName = new URL(
      url.startsWith("http") ? url : `https://${url}`,
    ).hostname.replace(/^www\./, "");

    // Versuche Titel aus der Homepage zu extrahieren
    if (homepage?.content) {
      const firstLine = homepage.content.split("\n").find((l) => l.trim().length > 2);
      if (firstLine && firstLine.trim().length < 100) {
        companyName = firstLine.trim();
      }
    }

    // Domain extrahieren
    const domain = new URL(
      url.startsWith("http") ? url : `https://${url}`,
    ).hostname.replace(/^www\./, "");

    // 2. Import-Log erstellen
    const { data: importLog } = await db
      .from("import_logs")
      .insert({
        file_name: url,
        file_path: "",
        row_count: 1,
        import_type: "url",
        source_url: url,
        status: "processing",
        created_by: user.id,
      })
      .select()
      .single();

    // 3. Duplikat-Pruefung gegen bestehende Leads (strikt: keine Stadt verfuegbar)
    const index = await loadExistingLeadsIndex(db);
    const dup = findDbDuplicateForLead(
      index,
      { company_name: companyName, website: domain },
      { strict: true },
    );

    if (dup) {
      // Aussortierter Lead: weder Insert noch Update — Negativ-Signal bleibt stabil.
      if (dup.archived) {
        await db
          .from("import_logs")
          .update({ imported_count: 0, duplicate_count: 1, status: "completed" })
          .eq("id", importLog?.id);
        return { success: true, leadId: dup.leadId, companyName, duplicate: true };
      }

      // Bestehender Lead: fehlende Felder fuellen, Enrichment erneut anstossen.
      const updated = await mergeIntoExistingLead(db, dup.leadId, { website: domain }, user.id);
      await enrichLead(dup.leadId, user.id);
      await db
        .from("import_logs")
        .update({
          imported_count: 0,
          updated_count: updated ? 1 : 0,
          duplicate_count: updated ? 0 : 1,
          status: "completed",
        })
        .eq("id", importLog?.id);

      await logAudit({
        userId: user.id,
        action: "import.url",
        entityType: "lead",
        entityId: dup.leadId,
        details: { url, company_name: companyName, duplicate: true, updated },
      });

      revalidatePath("/leads");
      revalidatePath("/import");
      revalidatePath("/");

      return { success: true, leadId: dup.leadId, companyName, duplicate: true, updated };
    }

    // 4. Lead erstellen
    const { data: lead, error: insertError } = await db
      .from("leads")
      .insert({
        company_name: companyName,
        website: domain,
        source_type: "url",
        source_url: url,
        source_import_id: importLog?.id,
        status: "imported",
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError || !lead) {
      return { success: false, error: insertError?.message ?? "Lead konnte nicht erstellt werden." };
    }

    // 5. Enrichment starten
    await enrichLead(lead.id, user.id);

    // 6. Import-Log abschließen
    await db
      .from("import_logs")
      .update({
        imported_count: 1,
        status: "completed",
      })
      .eq("id", importLog?.id);

    await logAudit({
      userId: user.id,
      action: "import.url",
      entityType: "lead",
      entityId: lead.id,
      details: { url, company_name: companyName },
    });

    revalidatePath("/leads");
    revalidatePath("/import");
    revalidatePath("/");

    return { success: true, leadId: lead.id, companyName };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unbekannter Fehler",
    };
  }
}

// ============================================================
// Verzeichnis-URL: Firmen erkennen
// ============================================================

export async function discoverFromDirectory(url: string): Promise<{
  companies: { name: string; website: string | null; description: string | null }[];
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await safeFetch(url.startsWith("http") ? url : `https://${url}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { companies: [], error: `Seite nicht erreichbar (HTTP ${res.status})` };
    }

    const html = await res.text();

    // HTML bereinigen (einfache Version)
    let content = html;
    content = content.replace(/<script[\s\S]*?<\/script>/gi, "");
    content = content.replace(/<style[\s\S]*?<\/style>/gi, "");
    content = content.replace(/<[^>]+>/g, " ");
    content = content.replace(/&amp;/g, "&");
    content = content.replace(/&nbsp;/g, " ");
    content = content.replace(/\s+/g, " ").trim();

    const companies = await extractCompaniesFromPage(content, url);

    return { companies };
  } catch (e) {
    return {
      companies: [],
      error: e instanceof Error ? e.message : "Unbekannter Fehler",
    };
  }
}

// ============================================================
// Verzeichnis-Import: Leads erstellen
// ============================================================

export async function createLeadsFromDirectory(
  companies: { name: string; website: string | null }[],
  sourceUrl: string,
): Promise<{
  success: boolean;
  imported: number;
  filtered: number;
  duplicates: number;
  updated: number;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, imported: 0, filtered: 0, duplicates: 0, updated: 0, error: "Nicht authentifiziert." };

  const db = createServiceClient();

  // Import-Log erstellen
  const { data: importLog } = await db
    .from("import_logs")
    .insert({
      file_name: sourceUrl,
      file_path: "",
      row_count: companies.length,
      import_type: "directory",
      source_url: sourceUrl,
      status: "processing",
      created_by: user.id,
    })
    .select()
    .single();

  // Blacklist + Cancel-Rules laden
  const [{ data: entries }, { data: rules }, { data: cancelRules }] = await Promise.all([
    db.from("blacklist_entries").select("*"),
    db.from("blacklist_rules").select("*").eq("is_active", true),
    db.from("cancel_rules").select("*").eq("is_active", true),
  ]);

  // Domain pro Firma einmal berechnen → Zeilen fuer Dedup aufbauen.
  const rows = companies.map((company) => {
    let domain: string | null = null;
    if (company.website) {
      try {
        domain = new URL(
          company.website.startsWith("http") ? company.website : `https://${company.website}`,
        ).hostname.replace(/^www\./, "");
      } catch {
        domain = null;
      }
    }
    return { company_name: company.name, website: domain };
  });

  // Interne Duplikate (gleiche Firma mehrfach auf derselben Seite)
  const internalDups = findInternalDuplicates(rows);
  // Bestehende Leads einmal laden (nicht pro Firma)
  const index = await loadExistingLeadsIndex(db);

  let imported = 0;
  let filtered = 0;
  let duplicates = 0;
  let updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const domain = row.website;

    // Internes Duplikat innerhalb des Batches → ueberspringen
    if (internalDups.has(i)) {
      duplicates++;
      continue;
    }

    // DB-Duplikat (strikt: Scrape-Leads haben keine Stadt)
    const dup = findDbDuplicateForLead(index, row, { strict: true });
    if (dup) {
      if (dup.archived) {
        duplicates++;
        continue;
      }
      const didUpdate = await mergeIntoExistingLead(db, dup.leadId, { website: domain }, user.id);
      if (didUpdate) updated++;
      else duplicates++;
      continue;
    }

    const leadData: Record<string, string | null> = {
      company_name: row.company_name,
      website: domain,
    };

    // Blacklist-Check
    const blacklistResult = checkLead(
      leadData,
      (rules as BlacklistRule[]) ?? [],
      (entries as BlacklistEntry[]) ?? [],
    );

    // Cancel-Rules-Check (Import-Phase)
    const cancelResult = evaluateCancelRules(
      leadData as Record<string, unknown>,
      (cancelRules as CancelRule[]) ?? [],
      "import",
    );

    let status = "imported";
    let blacklistHit = false;
    let blacklistReason: string | null = null;
    let cancelReason: string | null = null;
    let cancelRuleId: string | null = null;

    if (blacklistResult.blocked) {
      status = "filtered";
      blacklistHit = true;
      blacklistReason = blacklistResult.reasons.join("; ");
      filtered++;
    } else if (cancelResult.cancelled) {
      status = "cancelled";
      cancelReason = cancelResult.reasons.map((r) => r.reason).join("; ");
      cancelRuleId = cancelResult.reasons[0].ruleId;
      filtered++;
    } else {
      imported++;
    }

    const { data: newLead } = await db.from("leads").insert({
      company_name: row.company_name,
      website: domain,
      source_type: "directory",
      source_url: sourceUrl,
      source_import_id: importLog?.id,
      status,
      blacklist_hit: blacklistHit,
      blacklist_reason: blacklistReason,
      cancel_reason: cancelReason,
      cancel_rule_id: cancelRuleId,
      created_by: user.id,
    }).select("id, crm_status_id").single();

    // Frisch eingefuegten Lead in den Index aufnehmen, damit spaetere Zeilen
    // im selben Batch dagegen matchen.
    if (newLead) {
      addLeadToIndex(index, {
        id: newLead.id,
        website: domain,
        company_name: row.company_name,
        city: null,
        crm_status_id: newLead.crm_status_id ?? null,
        email: null,
        phone: null,
        lifecycle_stage: null,
        deleted_at: null,
      });
    }
  }

  // Import-Log abschließen
  await db
    .from("import_logs")
    .update({
      imported_count: imported,
      skipped_count: filtered,
      duplicate_count: duplicates,
      updated_count: updated,
      status: "completed",
    })
    .eq("id", importLog?.id);

  await logAudit({
    userId: user.id,
    action: "import.directory",
    entityType: "import_log",
    entityId: importLog?.id,
    details: { source_url: sourceUrl, total: companies.length, imported, filtered, duplicates, updated },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return { success: true, imported, filtered, duplicates, updated };
}
