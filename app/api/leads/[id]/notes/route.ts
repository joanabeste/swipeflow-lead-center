import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authorizeLeadsApi } from "@/lib/leads/api-auth";
import { logAudit } from "@/lib/audit-log";

// Service-Role-Client → Node-Runtime erzwingen (kein Edge).
export const runtime = "nodejs";

/**
 * Externe Notiz-API für einen Lead.
 *
 * GET  /api/leads/:id/notes  → { notes: [...] }     (chronologisch)
 * POST /api/leads/:id/notes  → { success, note }     (Notiz anlegen)
 * Header: Authorization: Bearer <LEADS_IMPORT_API_KEY>
 *
 * Notizen über die API haben keinen Session-User → `created_by` ist null (erscheinen
 * in der Lead-Historie als „System"-Notiz). Der Audit-Eintrag wird mit `source: "api"`
 * markiert, um API-Notizen erkennbar zu machen.
 *
 * Auth/Allowlist: `/api/leads/:id/notes` ist in proxy.ts vom Session-Gate ausgenommen
 * (self-auth per Bearer). Anhänge werden nicht unterstützt (nur Text).
 */

type Ctx = { params: Promise<{ id: string }> };

/** Prüft, ob der Lead existiert und nicht gelöscht ist. */
async function leadExists(
  db: ReturnType<typeof createServiceClient>,
  id: string,
): Promise<boolean> {
  const { data } = await db
    .from("leads")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(request: Request, ctx: Ctx) {
  if (!authorizeLeadsApi(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const db = createServiceClient();

  if (!(await leadExists(db, id))) {
    return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
  }

  const { data, error } = await db
    .from("lead_notes")
    .select("id, content, created_by, created_at, updated_at, merged_from_lead_id, merged_from_company")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[api/leads/:id/notes] list failed: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(request: Request, ctx: Ctx) {
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
  const content = (body as { content?: unknown })?.content;
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "Feld 'content' (Text) ist erforderlich." }, { status: 400 });
  }

  const db = createServiceClient();
  if (!(await leadExists(db, id))) {
    return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
  }

  // created_by bewusst null: externe API hat keinen Session-User (Konvention wie
  // System-/Merge-Notizen). FK auf leads(id) ist oben geprüft.
  const { data, error } = await db
    .from("lead_notes")
    .insert({ lead_id: id, content: content.trim(), created_by: null })
    .select("id, lead_id, content, created_by, created_at, updated_at")
    .single();

  if (error) {
    console.error(`[api/leads/:id/notes] insert failed: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    userId: null,
    action: "lead.note_added",
    entityType: "lead",
    entityId: id,
    details: { note_id: data.id, source: "api" },
  });

  console.log(`[api/leads/:id/notes] POST ${id} → note ${data.id}`);
  return NextResponse.json({ success: true, note: data }, { status: 201 });
}
