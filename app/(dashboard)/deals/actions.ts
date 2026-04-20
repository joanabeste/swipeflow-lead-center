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
import type { DealActivityType, DealStageKind } from "@/lib/deals/types";

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
  expectedCloseDate: string | null;
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

  // Entweder bestehender Lead ODER neuen Lead inline anlegen
  let leadId: string;
  if (input.leadId) {
    leadId = input.leadId;
  } else if (input.newCompanyName && input.newCompanyName.trim()) {
    const { data: newLead, error: leadErr } = await db
      .from("leads")
      .insert({
        company_name: input.newCompanyName.trim(),
        status: "imported",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (leadErr || !newLead) return { error: leadErr?.message ?? "Konnte Firma nicht anlegen." };
    leadId = newLead.id as string;
  } else {
    return { error: "Firma muss ausgewählt oder neu angelegt werden." };
  }

  const res = await createDealHelper({
    leadId,
    title,
    description: input.description.trim() || null,
    amountCents: cents,
    stageId: input.stageId,
    assignedTo: input.assignedTo ?? user.id,
    expectedCloseDate: input.expectedCloseDate,
    probability: input.probability ?? null,
    nextStep: input.nextStep?.trim() || null,
    lastFollowupAt: input.lastFollowupAt ?? null,
    createdBy: user.id,
  });
  if ("error" in res) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "deal.created",
    entityType: "deal",
    entityId: res.id,
    details: { title, amount_cents: cents, stage: input.stageId, lead_id: leadId },
  });

  revalidatePath("/deals");
  revalidatePath(`/crm/${leadId}`);
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
    expectedCloseDate?: string | null;
    probability?: number | null;
    nextStep?: string | null;
    lastFollowupAt?: string | null;
  },
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };

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
  if (updates.expectedCloseDate !== undefined) patch.expectedCloseDate = updates.expectedCloseDate;
  if (updates.probability !== undefined) {
    if (updates.probability != null && (updates.probability < 0 || updates.probability > 100)) {
      return { error: "Wahrscheinlichkeit muss zwischen 0 und 100 liegen." };
    }
    patch.probability = updates.probability;
  }
  if (updates.nextStep !== undefined) patch.nextStep = updates.nextStep?.trim() || null;
  if (updates.lastFollowupAt !== undefined) patch.lastFollowupAt = updates.lastFollowupAt;

  const res = await updateDealHelper(dealId, user.id, patch);
  if ("error" in res) return { error: res.error };

  await logAudit({
    userId: user.id,
    action: "deal.updated",
    entityType: "deal",
    entityId: dealId,
    details: patch,
  });

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
    action: "deal.deleted",
    entityType: "deal",
    entityId: dealId,
  });
  revalidatePath("/deals");
  return { success: true };
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
  revalidatePath("/deals");
  return { success: true };
}

export async function deleteStageAction(id: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!(await isAdmin(user.id))) return { error: "Nur Administratoren." };

  const db = createServiceClient();
  // Verhindere Löschen, wenn Deals dranhängen.
  const { count } = await db
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", id);
  if ((count ?? 0) > 0) {
    return { error: `Stage hat noch ${count} Deals. Erst Deals verschieben.` };
  }

  await deleteStageHelper(id);
  await logAudit({
    userId: user.id,
    action: "deal_stage.deleted",
    entityType: "deal_stage",
    entityId: id,
  });
  revalidatePath("/einstellungen/deal-stages");
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
