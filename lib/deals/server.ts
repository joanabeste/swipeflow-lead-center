import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type {
  Deal,
  DealStage,
  DealWithRelations,
  DealChange,
  DealStageKind,
  DealNote,
  DealActivityType,
} from "./types";

// ─── Stages ───────────────────────────────────────────────────

export async function listStages(activeOnly = false): Promise<DealStage[]> {
  const db = createServiceClient();
  const query = db
    .from("deal_stages")
    .select("id, label, description, color, display_order, kind, is_active")
    .order("display_order", { ascending: true });
  const { data } = activeOnly ? await query.eq("is_active", true) : await query;
  return (data ?? []).map(mapStageRow);
}

export async function saveStage(input: {
  id: string;
  label: string;
  description?: string | null;
  color: string;
  displayOrder: number;
  kind: DealStageKind;
  isActive: boolean;
  createdBy?: string | null;
}): Promise<void> {
  const db = createServiceClient();
  await db.from("deal_stages").upsert(
    {
      id: input.id,
      label: input.label,
      description: input.description ?? null,
      color: input.color,
      display_order: input.displayOrder,
      kind: input.kind,
      is_active: input.isActive,
      created_by: input.createdBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function deleteStage(id: string): Promise<void> {
  const db = createServiceClient();
  await db.from("deal_stages").delete().eq("id", id);
}

// ─── Deals ────────────────────────────────────────────────────

const DEAL_SELECT = `
  id, lead_id, title, description, amount_cents, currency, stage_id,
  assigned_to, expected_close_date, actual_close_date,
  probability, next_step, last_followup_at,
  company_name,
  created_by, created_at, updated_at,
  leads(company_name, domain),
  deal_stages!inner(label, color, kind),
  profiles:assigned_to(name, avatar_url)
`;

export async function listDeals(): Promise<DealWithRelations[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("deals")
    .select(DEAL_SELECT)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return (data ?? []).map(mapDealRelRow);
}

export async function getDeal(id: string): Promise<DealWithRelations | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("deals")
    .select(DEAL_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? mapDealRelRow(data) : null;
}

export async function createDeal(input: {
  leadId: string | null;
  companyName: string;
  title: string;
  description?: string | null;
  amountCents: number;
  stageId: string;
  assignedTo: string | null;
  expectedCloseDate: string | null;
  probability?: number | null;
  nextStep?: string | null;
  lastFollowupAt?: string | null;
  createdBy: string;
}): Promise<{ id: string } | { error: string }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("deals")
    .insert({
      lead_id: input.leadId,
      company_name: input.companyName,
      title: input.title,
      description: input.description ?? null,
      amount_cents: input.amountCents,
      stage_id: input.stageId,
      assigned_to: input.assignedTo,
      expected_close_date: input.expectedCloseDate,
      probability: input.probability ?? null,
      next_step: input.nextStep ?? null,
      last_followup_at: input.lastFollowupAt ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Konnte Deal nicht anlegen." };

  await db.from("deal_changes").insert({
    deal_id: data.id,
    changed_by: input.createdBy,
    field: "created",
    new_value: input.title,
  });
  return { id: data.id as string };
}

/**
 * Aktualisiert Felder eines Deals und schreibt pro geändertem Feld einen
 * `deal_changes`-Eintrag.
 */
export async function updateDeal(
  id: string,
  changedBy: string,
  updates: Partial<{
    title: string;
    description: string | null;
    amountCents: number;
    stageId: string;
    assignedTo: string | null;
    expectedCloseDate: string | null;
    actualCloseDate: string | null;
    probability: number | null;
    nextStep: string | null;
    lastFollowupAt: string | null;
  }>,
): Promise<{ success: true } | { error: string }> {
  const db = createServiceClient();
  const { data: before } = await db
    .from("deals")
    .select("title, description, amount_cents, stage_id, assigned_to, expected_close_date, actual_close_date, probability, next_step, last_followup_at")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "Deal nicht gefunden." };

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];

  function track(field: string, oldVal: unknown, newVal: unknown) {
    const o = oldVal === null || oldVal === undefined ? null : String(oldVal);
    const n = newVal === null || newVal === undefined ? null : String(newVal);
    if (o !== n) changes.push({ field, oldValue: o, newValue: n });
  }

  if (updates.title !== undefined) {
    row.title = updates.title;
    track("title", before.title, updates.title);
  }
  if (updates.description !== undefined) {
    row.description = updates.description;
    track("description", before.description, updates.description);
  }
  if (updates.amountCents !== undefined) {
    row.amount_cents = updates.amountCents;
    track("amount_cents", before.amount_cents, updates.amountCents);
  }
  if (updates.stageId !== undefined) {
    row.stage_id = updates.stageId;
    track("stage_id", before.stage_id, updates.stageId);
    // Bei Wechsel auf terminalen Stage (won/lost) das actual_close_date setzen.
    const { data: newStage } = await db
      .from("deal_stages")
      .select("kind")
      .eq("id", updates.stageId)
      .maybeSingle();
    if (newStage && (newStage.kind === "won" || newStage.kind === "lost")) {
      if (!before.actual_close_date) {
        row.actual_close_date = new Date().toISOString().slice(0, 10);
        track("actual_close_date", before.actual_close_date, row.actual_close_date);
      }
    }
  }
  if (updates.assignedTo !== undefined) {
    row.assigned_to = updates.assignedTo;
    track("assigned_to", before.assigned_to, updates.assignedTo);
  }
  if (updates.expectedCloseDate !== undefined) {
    row.expected_close_date = updates.expectedCloseDate;
    track("expected_close_date", before.expected_close_date, updates.expectedCloseDate);
  }
  if (updates.actualCloseDate !== undefined) {
    row.actual_close_date = updates.actualCloseDate;
    track("actual_close_date", before.actual_close_date, updates.actualCloseDate);
  }
  if (updates.probability !== undefined) {
    row.probability = updates.probability;
    track("probability", before.probability, updates.probability);
  }
  if (updates.nextStep !== undefined) {
    row.next_step = updates.nextStep;
    track("next_step", before.next_step, updates.nextStep);
  }
  if (updates.lastFollowupAt !== undefined) {
    row.last_followup_at = updates.lastFollowupAt;
    track("last_followup_at", before.last_followup_at, updates.lastFollowupAt);
  }

  const { error } = await db.from("deals").update(row).eq("id", id);
  if (error) return { error: error.message };

  if (changes.length > 0) {
    await db.from("deal_changes").insert(
      changes.map((c) => ({
        deal_id: id,
        changed_by: changedBy,
        field: c.field,
        old_value: c.oldValue,
        new_value: c.newValue,
      })),
    );
  }

  return { success: true };
}

export async function deleteDeal(id: string): Promise<void> {
  const db = createServiceClient();
  // Soft-Delete: 30 Tage im Papierkorb. pg_cron purged danach endgültig
  // (Migration 040). deal_changes + deal_notes bleiben bis zum endgültigen
  // Löschen erhalten (damit Wiederherstellung die History mitbringt).
  await db
    .from("deals")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
}

// ─── Deal-Notes / Activities ──────────────────────────────────

export async function listDealNotes(dealId: string): Promise<DealNote[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("deal_notes")
    .select(`
      id, deal_id, content, activity_type, created_by, created_at,
      profiles:created_by(name, avatar_url)
    `)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => {
    const profile = firstOrNull(
      (r as unknown as { profiles?: JoinRow<{ name: string | null; avatar_url: string | null }> })
        .profiles ?? null,
    );
    return {
      id: r.id as string,
      dealId: r.deal_id as string,
      content: r.content as string,
      activityType: r.activity_type as DealActivityType,
      createdBy: (r.created_by as string | null) ?? null,
      createdByName: profile?.name ?? null,
      createdByAvatarUrl: profile?.avatar_url ?? null,
      createdAt: r.created_at as string,
    };
  });
}

export async function addDealNote(input: {
  dealId: string;
  content: string;
  activityType: DealActivityType;
  createdBy: string;
}): Promise<{ id: string } | { error: string }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("deal_notes")
    .insert({
      deal_id: input.dealId,
      content: input.content,
      activity_type: input.activityType,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Konnte Notiz nicht speichern." };
  return { id: data.id as string };
}

export async function deleteDealNote(noteId: string): Promise<void> {
  const db = createServiceClient();
  await db.from("deal_notes").delete().eq("id", noteId);
}

export async function listDealChanges(dealId: string): Promise<DealChange[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("deal_changes")
    .select(`
      id, deal_id, changed_by, field, old_value, new_value, created_at,
      profiles:changed_by(name)
    `)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    dealId: r.deal_id as string,
    changedBy: (r.changed_by as string | null) ?? null,
    changedByName:
      (r.profiles as unknown as { name?: string } | null)?.name ?? null,
    field: r.field as string,
    oldValue: (r.old_value as string | null) ?? null,
    newValue: (r.new_value as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

// ─── Mapping-Helpers ──────────────────────────────────────────

type StageRow = {
  id: string;
  label: string;
  description: string | null;
  color: string;
  display_order: number;
  kind: DealStageKind;
  is_active: boolean;
};
function mapStageRow(r: StageRow): DealStage {
  return {
    id: r.id,
    label: r.label,
    description: r.description,
    color: r.color,
    displayOrder: r.display_order,
    kind: r.kind,
    isActive: r.is_active,
  };
}

// Supabase typed-select liefert Joins als Array-Shape — wir akzeptieren beides.
type JoinRow<T> = T | T[] | null;
type DealRelRow = {
  id: string;
  lead_id: string | null;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  stage_id: string;
  assigned_to: string | null;
  expected_close_date: string | null;
  actual_close_date: string | null;
  probability: number | null;
  next_step: string | null;
  last_followup_at: string | null;
  company_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  leads: JoinRow<{ company_name: string; domain: string | null }>;
  deal_stages: JoinRow<{ label: string; color: string; kind: DealStageKind }>;
  profiles?: JoinRow<{ name: string | null; avatar_url: string | null }>;
};

function firstOrNull<T>(v: JoinRow<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function mapDealRelRow(r: unknown): DealWithRelations {
  const row = r as DealRelRow;
  const lead = firstOrNull(row.leads);
  const stage = firstOrNull(row.deal_stages);
  const profile = firstOrNull(row.profiles ?? null);
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    description: row.description,
    amountCents: row.amount_cents,
    currency: row.currency,
    stageId: row.stage_id,
    assignedTo: row.assigned_to,
    expectedCloseDate: row.expected_close_date,
    actualCloseDate: row.actual_close_date,
    probability: row.probability,
    nextStep: row.next_step,
    lastFollowupAt: row.last_followup_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Snapshot auf dem Deal hat Vorrang — bleibt auch stehen, wenn der Lead
    // gelöscht wurde (FK ON DELETE SET NULL).
    company_name: row.company_name ?? lead?.company_name ?? "—",
    company_domain: lead?.domain ?? null,
    stage_label: stage?.label ?? row.stage_id,
    stage_color: stage?.color ?? "#6b7280",
    stage_kind: stage?.kind ?? "open",
    assignee_name: profile?.name ?? null,
    assignee_avatar_url: profile?.avatar_url ?? null,
  };
}

// Pflicht-Cast damit `Deal` für Code konsumierbar ist, der keine Relations braucht.
export function dealCore(d: DealWithRelations): Deal {
  return {
    id: d.id,
    leadId: d.leadId,
    title: d.title,
    description: d.description,
    amountCents: d.amountCents,
    currency: d.currency,
    stageId: d.stageId,
    assignedTo: d.assignedTo,
    expectedCloseDate: d.expectedCloseDate,
    actualCloseDate: d.actualCloseDate,
    probability: d.probability,
    nextStep: d.nextStep,
    lastFollowupAt: d.lastFollowupAt,
    createdBy: d.createdBy,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
