import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeLeadsApi } from "@/lib/leads/api-auth";
import { LEAD_API_COLS } from "@/lib/leads/api-fields";

// Service-Role-Client → Node-Runtime erzwingen (kein Edge).
export const runtime = "nodejs";

/**
 * Externe Lead-Lese-API.
 *
 * GET /api/leads
 * Header: Authorization: Bearer <LEADS_IMPORT_API_KEY>
 *
 * Listet Leads (ohne gelöschte). Query-Parameter:
 *   status   z.B. "imported" = die frisch importierten "Neuen Leads"
 *   vertical Filter auf die Sparte
 *   q        Volltext-ähnliche Suche (Firmenname/Website/Ort/E-Mail/Telefon)
 *   include  "contacts" und/oder "links" (kommasepariert) → reichert die Antwort an
 *   limit    1..200 (Default 50)
 *   offset   ab welchem Datensatz (Default 0)
 *
 * Antwort: { leads: [...], total, limit, offset }. `total` ist die Gesamtzahl
 * passender Leads (für Paginierung), unabhängig von limit/offset.
 *
 * Auth/Allowlist: in proxy.ts vom Session-Gate ausgenommen; self-auth per Bearer.
 */

function groupByLead<T extends { lead_id: string }>(rows: T[] | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows ?? []) {
    const list = map.get(row.lead_id);
    if (list) list.push(row);
    else map.set(row.lead_id, [row]);
  }
  return map;
}

function parseIntParam(value: string | null, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: Request) {
  if (!authorizeLeadsApi(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const vertical = url.searchParams.get("vertical");
  const q = url.searchParams.get("q");
  const include = new Set(
    (url.searchParams.get("include") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const limit = Math.min(Math.max(parseIntParam(url.searchParams.get("limit"), 50), 1), 200);
  const offset = Math.max(parseIntParam(url.searchParams.get("offset"), 0), 0);

  const db = createServiceClient();
  let query = db
    .from("leads")
    .select(LEAD_API_COLS, { count: "exact" })
    .is("deleted_at", null);

  if (status) query = query.eq("status", status);
  if (vertical) query = query.eq("vertical", vertical);
  if (q) {
    // Sonderzeichen entfernen, die die PostgREST-`or`-Syntax aufbrechen würden.
    const safe = q.replace(/[%,()\\*]/g, " ").trim();
    if (safe) {
      query = query.or(
        `company_name.ilike.%${safe}%,website.ilike.%${safe}%,city.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`,
      );
    }
  }

  // Stabile Sortierung (neueste zuerst, id als Tiebreaker — wie in den Listen).
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error(`[api/leads] list failed: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Dynamische Spalten-Liste (Runtime-String) → der typisierte Client kann die
  // Zeilenform nicht ableiten; bewusst über unknown casten.
  const leads = (data ?? []) as unknown as Record<string, unknown>[];

  if (leads.length > 0 && (include.has("contacts") || include.has("links"))) {
    const ids = leads.map((l) => l.id as string);
    if (include.has("contacts")) {
      const { data: contacts } = await db
        .from("lead_contacts")
        .select("lead_id, name, role, email, phone, salutation")
        .in("lead_id", ids);
      const byLead = groupByLead(contacts as { lead_id: string }[] | null);
      for (const l of leads) l.contacts = byLead.get(l.id as string) ?? [];
    }
    if (include.has("links")) {
      const { data: links } = await db
        .from("lead_links")
        .select("lead_id, type, url, label")
        .in("lead_id", ids);
      const byLead = groupByLead(links as { lead_id: string }[] | null);
      for (const l of leads) l.links = byLead.get(l.id as string) ?? [];
    }
  }

  console.log(
    `[api/leads] list status=${status ?? "*"} vertical=${vertical ?? "*"} q=${q ? "y" : "n"} ` +
      `→ ${leads.length}/${count ?? 0} (offset=${offset} limit=${limit})`,
  );
  return NextResponse.json({ leads, total: count ?? leads.length, limit, offset });
}
