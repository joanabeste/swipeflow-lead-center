import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeLeadsApi } from "@/lib/leads/api-auth";
import { LEAD_API_COLS } from "@/lib/leads/api-fields";
import { updateLead } from "@/app/(dashboard)/leads/actions";
import type { Lead } from "@/lib/types";

// Service-Role-Client → Node-Runtime erzwingen (kein Edge).
export const runtime = "nodejs";

/**
 * Externe Lead-Detail-API (einzelner Lead lesen + aktualisieren).
 *
 * GET   /api/leads/:id  → { lead, contacts, links }   (vollständiger Lead)
 * PATCH /api/leads/:id  → { success: true }            (Stammdaten aktualisieren)
 * Header: Authorization: Bearer <LEADS_IMPORT_API_KEY>
 *
 * PATCH nutzt dieselbe Server-Action wie das CRM-Stammdaten-Formular
 * (updateLead) — inkl. Feld-Whitelist (Mass-Assignment-Guard: status/assigned_to/
 * deleted_at u.ä. sind NICHT setzbar), Change-Tracking, Audit, phone_source='manual'
 * bei Telefon-Änderung und Geocode-Reset bei Adress-Änderung.
 *
 * Auth/Allowlist: `/api/leads/:id` ist in proxy.ts vom Session-Gate ausgenommen
 * (self-auth per Bearer). Die session-authentifizierten Unterrouten
 * `:id/preview|geocode|screenshot-url` bleiben davon unberührt.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  if (!authorizeLeadsApi(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const db = createServiceClient();

  // Dieselbe kuratierte Spalten-Auswahl wie die Liste (keine internen Felder
  // wie blacklist_*/screenshots/created_by an externe Konsumenten).
  const { data, error } = await db
    .from("leads")
    .select(LEAD_API_COLS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error(`[api/leads/:id] load failed: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Dynamische Spalten-Liste → Zeilenform nicht ableitbar; bewusst über unknown casten.
  const lead = data as unknown as Record<string, unknown> | null;
  if (!lead) {
    return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
  }

  const [{ data: contacts }, { data: links }] = await Promise.all([
    db.from("lead_contacts")
      .select("id, name, role, email, phone, salutation, source_url")
      .eq("lead_id", id)
      .order("created_at"),
    db.from("lead_links")
      .select("id, type, url, label, created_at")
      .eq("lead_id", id)
      .order("created_at"),
  ]);

  return NextResponse.json({ lead, contacts: contacts ?? [], links: links ?? [] });
}

export async function PATCH(request: Request, ctx: Ctx) {
  if (!authorizeLeadsApi(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body muss ein Objekt mit Lead-Feldern sein." }, { status: 400 });
  }

  // updateLead wendet die Feld-Whitelist selbst an (unbekannte/gesperrte Keys
  // werden verworfen) und liefert {success} | {error}. auditSource="api" markiert
  // den Edit im Audit-Log (externe API hat keinen Session-User).
  const result = await updateLead(id, body as Partial<Lead>, { auditSource: "api" });
  if ("error" in result && result.error) {
    const status = result.error.includes("nicht gefunden") ? 404 : 400;
    console.warn(`[api/leads/:id] PATCH ${id} → ${result.error}`);
    return NextResponse.json({ error: result.error }, { status });
  }

  console.log(`[api/leads/:id] PATCH ${id} → ok (${Object.keys(body).join(",") || "no-op"})`);
  return NextResponse.json({ success: true });
}
