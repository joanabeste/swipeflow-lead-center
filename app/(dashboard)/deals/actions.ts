"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import {
  createDeal as createDealHelper,
  updateDeal as updateDealHelper,
  deleteDeal as deleteDealHelper,
  saveStage as saveStageHelper,
  deleteStage as deleteStageHelper,
  addDealNote as addDealNoteHelper,
  deleteDealNote as deleteDealNoteHelper,
} from "@/lib/deals/server";
import { parseAmountToCents } from "@/lib/deals/types";
import type { DealVertical } from "@/lib/deals/types";
import type { DealActivityType, DealStageKind } from "@/lib/deals/types";
import { findExistingLeadForManual } from "@/lib/leads/find-existing";
import { updateCrmStatus } from "@/app/(dashboard)/crm/actions";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function isAdmin(userId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db.from("profiles").select("role").eq("id", userId).single();
  return data?.role === "admin";
}

// ─── Deals ────────────────────────────────────────────────────

export async function createDealAction(input: {
  leadId?: string;                 // bestehender Lead
  newCompanyName?: string;         // ODER neuer Lead mit diesem Namen
  title: string;
  description: string;
  amountRaw: string;               // Nutzer-Eingabe, parsen nach Cent
  stageId: string;
  assignedTo: string | null;
  vertical?: DealVertical | null;
  expectedCloseDate?: string | null;
  actualCloseDate?: string | null;
  probability?: number | null;
  nextStep?: string | null;
  lastFollowupAt?: string | null;
}): Promise<{ success: true; dealId: string } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };

  const title = input.title.trim();
  if (!title) return { error: "Titel fehlt." };
  if (!input.stageId) return { error: "Stage fehlt." };

  const cents = parseAmountToCents(input.amountRaw);
  if (cents === null) return { error: "Volumen ist kein gültiger Betrag." };

  if (input.probability != null && (input.probability < 0 || input.probability > 100)) {
    return { error: "Wahrscheinlichkeit muss zwischen 0 und 100 liegen." };
  }

  const db = createServiceClient();

  // Entkopplung: Deal hängt optional an einem Lead. Bei "Neue Firma" wird
  // KEIN Lead angelegt — der Firmenname lebt als Snapshot auf dem Deal.
  // Bei "Bestehende Firma" wird der Name zusätzlich als Snapshot gespeichert,
  // damit der Deal überlebt, falls der Lead später im CRM gelöscht wird.
  let leadId: string | null;
  let companyName: string;
  if (input.leadId) {
    const { data: lead } = await db
      .from("leads")
      .select("id, company_name")
      .eq("id", input.leadId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!lead) return { error: "Ausgewählte Firma nicht gefunden." };
    leadId = lead.id as string;
    companyName = (lead.company_name as string | null) ?? "—";
  } else if (input.newCompanyName && input.newCompanyName.trim()) {
    leadId = null;
    companyName = input.newCompanyName.trim();
  } else {
    return { error: "Firma muss ausgewählt oder neu angelegt werden." };
  }

  const res = await createDealHelper({
    leadId,
    companyName,
    title,
    description: input.description.trim() || null,
    amountCents: cents,
    stageId: input.stageId,
    assignedTo: input.assignedTo ?? user.id,
    vertical: input.vertical ?? null,
    expectedCloseDate: input.expectedCloseDate ?? null,
    actualCloseDate: input.actualCloseDate ?? null,
    probability: input.probability ?? null,
    nextStep: input.nextStep?.trim() || null,
    lastFollowupAt: input.lastFollowupAt ?? null,
    createdBy: user.id,
  });
  if ("error" in res) return { error: res.error };

  // Lead in die Pipeline heben: ein Lead mit Deal ist kein "neuer Lead" mehr.
  // Guard auf lifecycle_stage='lead' stellt sicher, dass Kunden/archivierte
  // Leads nie zurückgestuft werden.
  if (leadId) {
    await db
      .from("leads")
      .update({ lifecycle_stage: "deal" })
      .eq("id", leadId)
      .eq("lifecycle_stage", "lead");
  }

  await logAudit({
    userId: user.id,
    action: "deal.created",
    entityType: "deal",
    entityId: res.id,
    details: { title, amount_cents: cents, stage: input.stageId, lead_id: leadId, company_name: companyName },
  });

  revalidatePath("/deals");
  if (leadId) revalidatePath(`/crm/${leadId}`);
  return { success: true, dealId: res.id };
}

export async function updateDealAction(
  dealId: string,
  updates: {
    title?: string;
    description?: string | null;
    amountRaw?: string;
    stageId?: string;
    assignedTo?: string | null;
    vertical?: DealVertical | null;
    expectedCloseDate?: string | null;
    actualCloseDate?: string | null;
    probability?: number | null;
    nextStep?: string | null;
    lastFollowupAt?: string | null;
    company?: { mode: "existing"; leadId: string } | { mode: "new"; name: string };
  },
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };

  const db = createServiceClient();
  const patch: Parameters<typeof updateDealHelper>[2] = {};
  if (updates.title !== undefined) {
    const t = updates.title.trim();
    if (!t) return { error: "Titel darf nicht leer sein." };
    patch.title = t;
  }
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.amountRaw !== undefined) {
    const cents = parseAmountToCents(updates.amountRaw);
    if (cents === null) return { error: "Volumen ist kein gültiger Betrag." };
    patch.amountCents = cents;
  }
  if (updates.stageId !== undefined) patch.stageId = updates.stageId;
  if (updates.assignedTo !== undefined) patch.assignedTo = updates.assignedTo;
  if (updates.vertical !== undefined) patch.vertical = updates.vertical;
  if (updates.expectedCloseDate !== undefined) patch.expectedCloseDate = updates.expectedCloseDate;
  if (updates.actualCloseDate !== undefined) patch.actualCloseDate = updates.actualCloseDate;
  if (updates.probability !== undefined) {
    if (updates.probability != null && (updates.probability < 0 || updates.probability > 100)) {
      return { error: "Wahrscheinlichkeit muss zwischen 0 und 100 liegen." };
    }
    patch.probability = updates.probability;
  }
  if (updates.nextStep !== undefined) patch.nextStep = updates.nextStep?.trim() || null;
  if (updates.lastFollowupAt !== undefined) patch.lastFollowupAt = updates.lastFollowupAt;

  // Aktuellen Deal-Zustand einmal laden — für den Stage-Sync-Guard (nur bei
  // echtem Stage-Wechsel) und die CRM-Revalidation des vorherigen Leads.
  const { data: beforeDeal } = await db
    .from("deals")
    .select("stage_id, lead_id")
    .eq("id", dealId)
    .maybeSingle();
  if (!beforeDeal) return { error: "Deal nicht gefunden." };
  const oldLeadId = (beforeDeal.lead_id as string | null) ?? null;

  // Firma nachträglich ändern — spiegelt die Auflösung aus createDealAction:
  // bestehender Lead → lead_id + Namens-Snapshot; neue Firma → nur Snapshot, kein Lead.
  let newLeadId: string | null | undefined; // undefined = keine Firmenänderung
  if (updates.company) {
    if (updates.company.mode === "existing") {
      const { data: lead } = await db
        .from("leads")
        .select("id, company_name")
        .eq("id", updates.company.leadId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!lead) return { error: "Ausgewählte Firma nicht gefunden." };
      patch.leadId = lead.id as string;
      patch.companyName = (lead.company_name as string | null) ?? "—";
      newLeadId = lead.id as string;
    } else {
      const name = updates.company.name.trim();
      if (!name) return { error: "Bitte den Namen der neuen Firma eingeben." };
      patch.leadId = null;
      patch.companyName = name;
      newLeadId = null;
    }
  }

  const res = await updateDealHelper(dealId, user.id, patch);
  if ("error" in res) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "deal.updated",
    entityType: "deal",
    entityId: dealId,
    details: patch,
  });

  // Stage-Wechsel → CRM-Status des verknüpften Leads mitziehen. Deal-Stages und
  // custom_lead_statuses teilen seit Migration 131 denselben Wertebereich, daher
  // ist stageId direkt als crm_status_id verwendbar. Nur bei ECHTEM Stage-Wechsel
  // syncen — sonst würde jedes Deal-Speichern (z.B. eine reine Firmen-Zuordnung)
  // eine No-op-Statusänderung im Lead-Aktivitätsfeed erzeugen. Und niemals beim
  // Verknüpfen/Wechseln der Firma: das darf den Lead-Status grundsätzlich nicht
  // anfassen. Best-Effort: schlägt der Sync fehl, bleibt der Deal-Move bestehen.
  if (!updates.company && patch.stageId !== undefined && patch.stageId !== beforeDeal.stage_id) {
    if (beforeDeal.lead_id) {
      const sync = await updateCrmStatus(beforeDeal.lead_id as string, patch.stageId);
      if (sync && "error" in sync && sync.error) {
        console.warn("[updateDealAction] Lead-Status-Sync fehlgeschlagen:", sync.error);
      }
    }
  }

  // Neuen Lead in die Pipeline heben (analog createDealAction) und alte + neue
  // CRM-Seite revalidieren. Guard auf lifecycle_stage='lead' verhindert, dass
  // Kunden/archivierte Leads zurückgestuft werden.
  if (newLeadId) {
    await db
      .from("leads")
      .update({ lifecycle_stage: "deal" })
      .eq("id", newLeadId)
      .eq("lifecycle_stage", "lead");
  }
  if (updates.company) {
    if (oldLeadId) revalidatePath(`/crm/${oldLeadId}`);
    if (newLeadId && newLeadId !== oldLeadId) revalidatePath(`/crm/${newLeadId}`);
  }

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  return { success: true };
}

export async function deleteDealAction(dealId: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  await deleteDealHelper(dealId);
  await logAudit({
    userId: user.id,
    action: "deal.trashed",
    entityType: "deal",
    entityId: dealId,
  });
  revalidatePath("/deals");
  revalidatePath("/einstellungen/papierkorb");
  return { success: true };
}

// ─── Won → Fulfillment-Projekt anlegen ────────────────────────

/**
 * Legt nach einem gewonnenen Deal ein Fulfillment-Projekt an.
 * - Verknüpft per `projects.deal_id` zurück → idempotent (zweiter Aufruf
 *   liefert die bestehende projectId).
 * - Wenn der Deal keinen Lead hat, wird einer aus `company_name` angelegt
 *   (lifecycle_stage='customer') und `deals.lead_id` nachgezogen.
 * - Setzt den Lead in jedem Fall auf `lifecycle_stage='customer'`.
 * - Optional: legt einen primären Ansprechpartner gleich mit an.
 */
export async function createProjectFromDeal(
  dealId: string,
  input: {
    projectName: string;
    vertical?: "webdesign" | "recruiting" | "sonstiges" | "";
    startedAt?: string | null;
    notes?: string | null;
    primaryContact?: {
      first_name: string;
      last_name?: string;
      salutation?: "du" | "sie";
      role?: string;
      email?: string;
      phone?: string;
    } | null;
  },
): Promise<
  | { success: true; data: { projectId: string; leadId: string; alreadyExisted: boolean } }
  | { error: string }
> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };

  const projectName = input.projectName.trim();
  if (!projectName) return { error: "Projekt-Name fehlt." };

  const db = createServiceClient();

  const { data: deal, error: dealError } = await db
    .from("deals")
    .select("id, lead_id, company_name, title, stage_id")
    .eq("id", dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (dealError) return { error: `DB-Fehler: ${dealError.message}` };
  if (!deal) return { error: "Deal nicht gefunden." };

  // Idempotenz: existiert bereits ein Projekt für diesen Deal?
  const { data: existing } = await db
    .from("projects")
    .select("id, lead_id")
    .eq("deal_id", dealId)
    .maybeSingle();
  if (existing) {
    return {
      success: true,
      data: {
        projectId: existing.id as string,
        leadId: existing.lead_id as string,
        alreadyExisted: true,
      },
    };
  }

  // Lead-Resolution
  let leadId = (deal.lead_id as string | null) ?? null;
  if (!leadId) {
    const companyName = ((deal.company_name as string | null) ?? "").trim();
    if (!companyName) return { error: "Deal hat weder Lead noch Firmenname." };
    const match = await findExistingLeadForManual(db, {
      company_name: companyName,
    });
    if (match?.archived) {
      return { error: "Dieser Lead wurde aussortiert und kann nicht erneut angelegt werden." };
    }
    if (match) {
      leadId = match.leadId;
      await db.from("deals").update({ lead_id: leadId }).eq("id", dealId);
    } else {
      const { data: newLead, error: leadErr } = await db
        .from("leads")
        .insert({
          company_name: companyName,
          source_type: "manual",
          status: "imported",
          lifecycle_stage: "customer",
          became_customer_at: new Date().toISOString(),
          created_by: user.id,
        })
        .select("id")
        .single();
      if (leadErr || !newLead) return { error: `Lead-Anlage fehlgeschlagen: ${leadErr?.message ?? "unbekannt"}` };
      leadId = newLead.id as string;
      await db.from("deals").update({ lead_id: leadId }).eq("id", dealId);
    }
  } else {
    // Bestehenden Lead auf Kunde heben (idempotent: nur wenn noch nicht).
    const { data: leadRow } = await db
      .from("leads")
      .select("lifecycle_stage")
      .eq("id", leadId)
      .maybeSingle();
    if (leadRow && leadRow.lifecycle_stage !== "customer") {
      await db
        .from("leads")
        .update({ lifecycle_stage: "customer", became_customer_at: new Date().toISOString() })
        .eq("id", leadId);
    }
  }

  // Projekt anlegen
  const vertical = input.vertical && input.vertical.length > 0 ? input.vertical : null;
  const { data: project, error: projectErr } = await db
    .from("projects")
    .insert({
      lead_id: leadId,
      deal_id: dealId,
      name: projectName,
      status: "onboarding",
      vertical,
      started_at: input.startedAt || null,
      notes: input.notes?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (projectErr || !project) {
    if (projectErr?.message && /column .*deal_id/i.test(projectErr.message)) {
      return { error: "Migration 080 fehlt — `projects.deal_id` ist noch nicht vorhanden." };
    }
    return { error: `Projekt-Anlage fehlgeschlagen: ${projectErr?.message ?? "unbekannt"}` };
  }
  const projectId = project.id as string;

  // Optional: primären Ansprechpartner anlegen.
  const pc = input.primaryContact;
  if (pc && pc.first_name.trim()) {
    // Falls bereits ein primary Contact existiert, diesen entprimären.
    await db.from("customer_contacts").update({ is_primary: false }).eq("lead_id", leadId);
    await db.from("customer_contacts").insert({
      lead_id: leadId,
      first_name: pc.first_name.trim(),
      last_name: pc.last_name?.trim() || null,
      salutation: pc.salutation ?? "sie",
      role: pc.role?.trim() || null,
      email: pc.email?.trim() || null,
      phone: pc.phone?.trim() || null,
      is_primary: true,
      created_by: user.id,
    });
  }

  await logAudit({
    userId: user.id,
    action: "project.create_from_deal",
    entityType: "project",
    entityId: projectId,
    details: { deal_id: dealId, lead_id: leadId },
  });

  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/fulfillment/projekte");
  revalidatePath("/fulfillment/kunden");
  revalidatePath(`/fulfillment/kunden/${leadId}`);
  revalidatePath("/crm");

  return { success: true, data: { projectId, leadId, alreadyExisted: false } };
}

// ─── Deal-Notes / Activities ──────────────────────────────────

export async function addDealNoteAction(input: {
  dealId: string;
  content: string;
  activityType: DealActivityType;
}): Promise<{ success: true; noteId: string } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  const content = input.content.trim();
  if (!content) return { error: "Notiz darf nicht leer sein." };

  const res = await addDealNoteHelper({
    dealId: input.dealId,
    content,
    activityType: input.activityType,
    createdBy: user.id,
  });
  if ("error" in res) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "deal.note_added",
    entityType: "deal",
    entityId: input.dealId,
    details: { activity_type: input.activityType, note_id: res.id },
  });

  revalidatePath(`/deals/${input.dealId}`);
  return { success: true, noteId: res.id };
}

export async function deleteDealNoteAction(
  noteId: string,
  dealId: string,
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  await deleteDealNoteHelper(noteId);
  await logAudit({
    userId: user.id,
    action: "deal.note_deleted",
    entityType: "deal",
    entityId: dealId,
    details: { note_id: noteId },
  });
  revalidatePath(`/deals/${dealId}`);
  return { success: true };
}

// ─── Stage-Management (Admin) ─────────────────────────────────

export async function saveStageAction(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!(await isAdmin(user.id))) return { error: "Nur Administratoren." };

  const id = ((formData.get("id") as string) ?? "").trim();
  const label = ((formData.get("label") as string) ?? "").trim();
  const color = ((formData.get("color") as string) ?? "#6b7280").trim();
  const displayOrderRaw = (formData.get("display_order") as string) ?? "";
  const kind = (formData.get("kind") as string) ?? "open";
  const isActive = formData.get("is_active") === "on";
  const description = ((formData.get("description") as string) ?? "").trim() || null;

  if (!label) return { error: "Label fehlt." };
  if (!["open", "won", "lost"].includes(kind)) return { error: "Ungültiger Kind." };

  const displayOrder = parseInt(displayOrderRaw, 10) || 0;

  // Neuer ID = slugified label bei Neuanlage
  const finalId = id || slugify(label);

  await saveStageHelper({
    id: finalId,
    label,
    description,
    color,
    displayOrder,
    kind: kind as DealStageKind,
    isActive,
    createdBy: user.id,
  });

  await logAudit({
    userId: user.id,
    action: id ? "deal_stage.updated" : "deal_stage.created",
    entityType: "deal_stage",
    entityId: finalId,
    details: { label, kind },
  });

  revalidatePath("/einstellungen/deal-stages");
  revalidatePath("/einstellungen/crm-status");
  revalidatePath("/deals");
  revalidatePath("/crm");
  return { success: true };
}

export async function deleteStageAction(id: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!(await isAdmin(user.id))) return { error: "Nur Administratoren." };

  const db = createServiceClient();
  // Verhindere Entfernen aus der Pipeline, wenn Deals dranhängen (sie würden
  // sonst aus der Kanban verschwinden). Der Status selbst bleibt als CRM-Status
  // erhalten — deleteStageHelper setzt nur is_deal_stage=false.
  const { count } = await db
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);
  if ((count ?? 0) > 0) {
    return { error: `Phase hat noch ${count} Deals. Erst Deals verschieben.` };
  }

  await deleteStageHelper(id);
  await logAudit({
    userId: user.id,
    action: "deal_stage.deleted",
    entityType: "deal_stage",
    entityId: id,
  });
  revalidatePath("/einstellungen/deal-stages");
  revalidatePath("/einstellungen/crm-status");
  revalidatePath("/deals");
  revalidatePath("/crm");
  return { success: true };
}

// ─── Hilfen für Client ────────────────────────────────────────

export async function searchLeadsForDeal(query: string): Promise<{
  leads: { id: string; company_name: string; city: string | null }[];
}> {
  const user = await requireUser();
  if (!user) return { leads: [] };
  const db = createServiceClient();
  const q = query.trim();
  if (!q) return { leads: [] };
  const { data } = await db
    .from("leads")
    .select("id, company_name, city")
    .is("deleted_at", null)
    .ilike("company_name", `%${q}%`)
    .order("company_name", { ascending: true })
    .limit(10);
  return { leads: (data ?? []) as { id: string; company_name: string; city: string | null }[] };
}

export async function listTeamMembers(): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  const user = await requireUser();
  if (!user) return [];
  const db = createServiceClient();
  const { data } = await db
    .from("profiles")
    .select("id, name, avatar_url")
    .eq("status", "active")
    .order("name", { ascending: true });
  return (data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string | null) ?? "",
    avatarUrl: (p.avatar_url as string | null) ?? null,
  }));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "stage";
}
