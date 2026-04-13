"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { enrichLead } from "@/lib/enrichment/enrich-lead";
import { fetchCompanyPages } from "@/lib/enrichment/web-fetcher";
import { extractCompaniesFromPage } from "@/lib/enrichment/directory-extractor";
import { checkLead } from "@/lib/blacklist/checker";
import { evaluateCancelRules } from "@/lib/cancel-rules/evaluator";
import type { BlacklistEntry, BlacklistRule, CancelRule } from "@/lib/types";
import { revalidatePath } from "next/cache";

// ============================================================
// Einzelne Firmen-URL importieren
// ============================================================

export async function importFromUrl(url: string): Promise<{
  success: boolean;
  leadId?: string;
  companyName?: string;
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

    // 3. Lead erstellen
    const { data: lead, error: insertError } = await db
      .from("leads")
      .insert({
        company_name: companyName,
        domain,
        website: url.startsWith("http") ? url : `https://${url}`,
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

    // 4. Enrichment starten
    await enrichLead(lead.id, user.id);

    // 5. Import-Log abschließen
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

    const res = await fetch(url.startsWith("http") ? url : `https://${url}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
      redirect: "follow",
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
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, imported: 0, filtered: 0, error: "Nicht authentifiziert." };

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

  let imported = 0;
  let filtered = 0;

  for (const company of companies) {
    const domain = company.website
      ? new URL(company.website.startsWith("http") ? company.website : `https://${company.website}`).hostname.replace(/^www\./, "")
      : null;

    const leadData: Record<string, string | null> = {
      company_name: company.name,
      domain,
      website: company.website,
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

    await db.from("leads").insert({
      company_name: company.name,
      domain,
      website: company.website,
      source_type: "directory",
      source_url: sourceUrl,
      source_import_id: importLog?.id,
      status,
      blacklist_hit: blacklistHit,
      blacklist_reason: blacklistReason,
      cancel_reason: cancelReason,
      cancel_rule_id: cancelRuleId,
      created_by: user.id,
    });
  }

  // Import-Log abschließen
  await db
    .from("import_logs")
    .update({
      imported_count: imported,
      skipped_count: filtered,
      status: "completed",
    })
    .eq("id", importLog?.id);

  await logAudit({
    userId: user.id,
    action: "import.directory",
    entityType: "import_log",
    entityId: importLog?.id,
    details: { source_url: sourceUrl, total: companies.length, imported, filtered },
  });

  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath("/");

  return { success: true, imported, filtered };
}
