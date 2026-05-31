import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeLeadRow } from "@/lib/csv/normalizer";
import { validateCsvSize, createImportLog } from "@/lib/csv/import-helpers";
import { ingestLeads } from "@/lib/leads/ingest";

// Service-Role-Client + node:crypto → Node-Runtime erzwingen (kein Edge).
export const runtime = "nodejs";

/**
 * Externe Lead-Import-API fuer Claude Cowork.
 *
 * POST /api/leads/import
 * Header: Authorization: Bearer <LEADS_IMPORT_API_KEY>
 *
 * Legt neue Leads an — gebuendelt wie ein CSV-Import: jeder Aufruf erzeugt einen
 * import_logs-Eintrag, alle Leads bekommen dessen source_import_id und erscheinen mit
 * Status "imported" ("neue Leads") als ein Batch in der Import-Historie. Bestehende
 * Leads (Domain/E-Mail/Telefon/Firmenname-Match) werden strikt uebersprungen.
 *
 * Auth/Allowlist: Diese Route ist in proxy.ts vom Session-Gate ausgenommen und
 * authentifiziert sich selbst per Bearer-Token (timing-safe Vergleich).
 */

interface IncomingContact {
  name?: string;
  role?: string;
}

interface IncomingLead {
  company_name?: string;
  website?: string;
  phone?: string;
  email?: string;
  street?: string;
  city?: string;
  zip?: string;
  state?: string;
  country?: string;
  industry?: string;
  company_size?: string;
  legal_form?: string;
  register_id?: string;
  description?: string;
  contacts?: IncomingContact[];
  /** Optional vorbelegte Ampel-Bewertung (Webdesign): "green" | "amber" | "red". */
  traffic_light_rating?: string;
  traffic_light_reason?: string;
}

const VALID_TRAFFIC_LIGHT = new Set(["green", "amber", "red"]);

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.LEADS_IMPORT_API_KEY;
  if (!expected) return false;
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  // timingSafeEqual wirft bei Laengendifferenz → vorher abfangen.
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Uebernimmt nur Strings; alles andere wird zu null (defensiv gegen Fremd-Payloads). */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function POST(request: Request) {
  // 1. Auth
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. JSON parsen
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiges JSON" }, { status: 400 });
  }

  // 3. Body validieren (manuell — Projektkonvention, kein zod)
  const leadsRaw = (body as { leads?: unknown })?.leads;
  if (!Array.isArray(leadsRaw) || leadsRaw.length === 0) {
    return NextResponse.json(
      { error: "Feld 'leads' muss ein nicht-leeres Array sein." },
      { status: 400 },
    );
  }
  const sizeErr = validateCsvSize(leadsRaw.length); // MAX_ROWS = 10_000
  if (sizeErr) {
    return NextResponse.json({ error: sizeErr.error }, { status: 400 });
  }

  const source = str((body as { source?: unknown }).source) ?? "claude-cowork";

  // 4. Auf das normalizeLeadRow-Eingabeschema mappen (+ contacts → contact_N_name-Slots).
  const mappedRows = (leadsRaw as IncomingLead[]).map((lead) => {
    const base: Record<string, string | null> = {
      company_name: str(lead.company_name),
      website: str(lead.website),
      phone: str(lead.phone),
      email: str(lead.email),
      street: str(lead.street),
      city: str(lead.city),
      zip: str(lead.zip),
      state: str(lead.state),
      country: str(lead.country),
      industry: str(lead.industry),
      company_size: str(lead.company_size),
      legal_form: str(lead.legal_form),
      register_id: str(lead.register_id),
      description: str(lead.description),
    };
    // Bis zu 3 Kontakte in die Slots — Format "Name (Rolle)" passt zu parseContactName.
    (Array.isArray(lead.contacts) ? lead.contacts : []).slice(0, 3).forEach((c, i) => {
      const name = str(c?.name);
      if (!name) return;
      const role = str(c?.role);
      base[`contact_${i + 1}_name`] = role ? `${name} (${role})` : name;
    });
    // Optional vorbelegte Ampel — nur gültige Werte übernehmen (sonst ignorieren).
    const tl = str(lead.traffic_light_rating)?.toLowerCase() ?? null;
    base.traffic_light_rating = tl && VALID_TRAFFIC_LIGHT.has(tl) ? tl : null;
    base.traffic_light_reason = str(lead.traffic_light_reason);
    return normalizeLeadRow(base);
  });

  // 5. Import-Log anlegen (bundelt die Leads) + gemeinsame Ingest-Logik.
  const db = createServiceClient();
  let log;
  try {
    log = await createImportLog(db, {
      fileName: `api:${source}`,
      rowCount: mappedRows.length,
      importType: "api",
      userId: null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import-Log fehlgeschlagen" },
      { status: 500 },
    );
  }

  const result = await ingestLeads(db, mappedRows, log.id, {
    userId: null,
    vertical: null,
    onDuplicate: "skip", // externe API: bestehende Leads niemals anfassen
    sourceType: "manual",
  });

  console.log(
    `[leads/import] source=${source} log=${log.id} imported=${result.imported} ` +
      `duplicates=${result.duplicates} errors=${result.errors}`,
  );

  // 6. Antwort
  return NextResponse.json(
    {
      success: true,
      import_log_id: log.id,
      imported: result.imported,
      skipped: result.skipped,
      duplicates: result.duplicates,
      updated: result.updated,
      archived: result.archived,
      errors: result.errors,
      contacts_imported: result.contacts_imported,
      error_details: result.errorDetails,
    },
    { status: 201 },
  );
}
