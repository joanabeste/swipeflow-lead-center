import { createClient } from "@/lib/supabase/server";
import type { Lead, LeadStatus, CustomLeadStatus } from "@/lib/types";
import { LeadTableWrapper } from "./lead-table-wrapper";
import { getAllEnrichmentDefaults } from "@/lib/enrichment/defaults";
import { loadTablePrefs } from "@/lib/table-prefs";
import { normalizePhone } from "@/lib/csv/normalizer";
import { canonicalPhoneDigits, leadsHasPhoneNorm } from "@/lib/leads/phone-search";
import { LEAD_LIST_COLS } from "@/lib/leads/api-fields";

const PAGE_SIZE = 50;

// Whitelist erlaubter Spalten fuer Header-Filter (filter_<col>=<val>).
// Defensive Absicherung gegen PostgREST-Filter-Injection: NUR diese Spalten
// duerfen ueber URL-Filter angesprochen werden. Auth-/Status-Felder wie
// crm_status_id, assigned_to, deleted_at etc. sind hier bewusst NICHT enthalten.
// "traffic_light" wird in der Logik unten auf traffic_light_rating gemappt.
const ALLOWED_FILTER_COLUMNS = new Set<string>([
  "company_name",
  "website",
  "city",
  "zip",
  "industry",
  "company_size",
  "legal_form",
  "phone",
  "email",
  "source_type",
  "traffic_light",
]);

// Escape Wildcards und Trenner, damit Benutzereingaben in .ilike()/.or()
// nicht als PostgREST-Pattern interpretiert werden. Komma trennt or-Filter,
// % und _ sind SQL-LIKE-Wildcards. Max 100 Zeichen.
function escapeIlikeWildcards(s: string): string {
  return s
    .slice(0, 100)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, " ")
    .replace(/[()]/g, " ");
}

interface Props {
  params: Record<string, string | undefined>;
}

/**
 * Async Server Component mit der eigentlichen DB-Last. Wird in page.tsx in eine
 * <Suspense>-Grenze gesetzt, damit Kopf/Toggle sofort als statische Shell
 * gestreamt werden und nur die Tabelle nachlädt (siehe Next-16-Streaming-Doku).
 */
export async function LeadTableSection({ params }: Props) {
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  const sort = params.sort ?? "updated_at";
  const order = (params.order ?? "desc") as "asc" | "desc";
  const includeCrm = params.include_crm === "1";

  const supabase = await createClient();

  // Unabhängige Lasten parallel anstoßen (laufen neben der Leads-Query).
  const prefsPromise = loadTablePrefs("leads");
  const enrichPromise = getAllEnrichmentDefaults();
  const statusesPromise = supabase
    .from("custom_lead_statuses")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  let query = supabase
    .from("leads")
    .select(LEAD_LIST_COLS, { count: "exact" })
    .is("deleted_at", null);

  if (params.q) {
    const safeQ = escapeIlikeWildcards(params.q);
    const orParts = [
      `company_name.ilike.%${safeQ}%`,
      `website.ilike.%${safeQ}%`,
      `city.ilike.%${safeQ}%`,
      `phone.ilike.%${safeQ}%`,
    ];
    if (/\d/.test(params.q)) {
      // (a) Migrationsunabhängig: Teilstring in normalisierter +49-Form, damit
      //     "0571…" auch "+49571…" findet (Bestand mischt 0… und +49…).
      const normPhone = normalizePhone(params.q)?.replace(/^\+/, "");
      if (normPhone) {
        const safeNorm = escapeIlikeWildcards(normPhone);
        if (safeNorm !== safeQ) orParts.push(`phone.ilike.%${safeNorm}%`);
      }
      // (b) Voll format-unabhängig über die generierte Spalte phone_norm
      //     (Migration 122): Trenner/Präfixe egal. Fehlt die Spalte noch, wird die
      //     Klausel ausgelassen (kein Page-Bruch).
      if (await leadsHasPhoneNorm(supabase)) {
        const canon = canonicalPhoneDigits(params.q);
        if (canon) orParts.push(`phone_norm.ilike.%${escapeIlikeWildcards(canon)}%`);
      }
    }
    query = query.or(orParts.join(","));
  }

  if (params.status) {
    query = query.eq("status", params.status as LeadStatus);
  }

  // Standardmäßig keine CRM-Leads zeigen (die sind im CRM-Bereich zuhause).
  // Kriterium "im CRM": crm_status_id gesetzt ODER status in (qualified, exported).
  // Zusätzlich nur echte Leads (lifecycle_stage='lead') — Pipeline (deal),
  // Kunden (customer) und archivierte (archived) gehören nicht in "Neue Leads".
  // Spalte ist NOT NULL DEFAULT 'lead' (Migration 071), daher exakter Match.
  // Override via URL-Param: ?include_crm=1
  if (!includeCrm) {
    query = query
      .is("crm_status_id", null)
      .not("status", "in", '("qualified","exported")')
      .eq("lifecycle_stage", "lead");
  }

  // Spalten-Filter anwenden — Spaltenname strikt aus Whitelist, Wert escaped.
  const columnFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("filter_") && value) {
      const col = key.replace("filter_", "");
      if (!ALLOWED_FILTER_COLUMNS.has(col)) {
        console.warn(`[leads] Ignoriere unerlaubten Filter-Spaltennamen: ${col}`);
        continue;
      }
      columnFilters[col] = value;
      if (col === "traffic_light") {
        // Ampel: exakter Match auf die echte Spalte (nicht ilike).
        query = query.eq("traffic_light_rating", value);
      } else {
        query = query.ilike(col, `%${escapeIlikeWildcards(value)}%`);
      }
    }
  }

  // "traffic_light" sortiert über den invertierten Score (grün hoch → rot niedrig);
  // unbewertete Leads landen ans Ende.
  const sortColumn = sort === "traffic_light" ? "traffic_light_score" : sort;
  const orderOpts =
    sort === "traffic_light"
      ? { ascending: order === "asc", nullsFirst: false }
      : { ascending: order === "asc" };

  const { data: leads, count } = await query
    .order(sortColumn, orderOpts)
    // Stabiler Tiebreaker (eindeutige id) — verhindert nicht-deterministisches
    // Umsortieren bei Gleichständen (z. B. gleicher updated_at aus Batch-Import).
    .order("id", { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  const [initialColumnPrefs, enrichmentDefaults, { data: customStatuses }] =
    await Promise.all([prefsPromise, enrichPromise, statusesPromise]);

  return (
    <>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {count ?? 0} Leads
        {!includeCrm && " — im CRM liegende sind ausgeblendet"}
      </p>

      <LeadTableWrapper
        leads={(leads as unknown as Lead[]) ?? []}
        totalPages={totalPages}
        currentPage={page}
        currentSort={sort}
        currentOrder={order}
        currentQuery={params.q ?? ""}
        currentStatus={params.status ?? ""}
        currentFilters={columnFilters}
        initialColumnPrefs={initialColumnPrefs}
        enrichmentDefaults={enrichmentDefaults}
        customStatuses={(customStatuses as CustomLeadStatus[]) ?? []}
      />
    </>
  );
}
