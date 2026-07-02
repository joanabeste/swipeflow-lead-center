// Verarbeitet ein verifiziertes Calendly-Webhook-Event:
//   1. Lead per E-Mail/Telefon finden — oder neu anlegen.
//   2. CRM-Status gemäß calendly_event_mappings setzen (booked/canceled).
//   3. Termin in lead_appointments upserten (idempotent über invitee-URI).
//   4. Historien-Eintrag via audit_logs (lead.appointment_booked/_canceled).
//
// Läuft ohne User-Session (Webhook) → Service-Role-Client, created_by/userId=null.
// Provisionen werden hier bewusst NICHT vergeben — die sind an eine Personen-Aktion
// gebunden (siehe updateCrmStatus in app/(dashboard)/crm/actions.ts).

import { createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";
import { findExistingLeadForManual } from "@/lib/leads/find-existing";
import { normalizeEmail, normalizePhone } from "@/lib/csv/normalizer";
import { createDeal } from "@/lib/deals/server";
import { APPOINTMENT_STATUS_ID } from "@/lib/service-mode-constants";
import type { CalendlyWebhookEvent, CalendlyInviteePayload } from "./types";

// Regeln für automatische Deal-Anlage bei Calendly-Buchungen. Erkennung bewusst simpel
// über den Event-Namen (erste passende Regel gewinnt). Weitere Event-Typen hier ergänzbar.
interface AutoDealRule {
  match: (nameLower: string) => boolean;
  title: string;
  amountCents: number;
  vertical: "webdesign" | "recruiting";
}
const AUTO_DEAL_RULES: AutoDealRule[] = [
  { match: (n) => n.includes("web"),        title: "Website-Relaunch", amountCents: 310000, vertical: "webdesign" },
  { match: (n) => n.includes("recruiting"), title: "Social Recruiting", amountCents: 250000, vertical: "recruiting" },
];
function matchAutoDealRule(name: string | null): AutoDealRule | null {
  const n = (name ?? "").toLowerCase();
  return AUTO_DEAL_RULES.find((r) => r.match(n)) ?? null;
}

export type IngestResult =
  | { ok: true; info: string; leadId?: string }
  | { ok: false; info: string };

export async function handleCalendlyEvent(event: CalendlyWebhookEvent): Promise<IngestResult> {
  const eventName = event.event;
  const isCancel = eventName === "invitee.canceled";
  const isCreate = eventName === "invitee.created";
  if (!isCreate && !isCancel) {
    return { ok: true, info: `ignored event: ${eventName}` };
  }

  const payload = event.payload ?? ({} as CalendlyInviteePayload);
  const inviteeUri = payload.uri ?? null;
  if (!inviteeUri) return { ok: false, info: "missing invitee uri" };

  const db = createServiceClient();

  const scheduled = payload.scheduled_event ?? null;
  const eventTypeUri = scheduled?.event_type ?? null;
  const eventTypeName = scheduled?.name ?? null;
  const scheduledAt = scheduled?.start_time ?? null;
  const joinUrl = scheduled?.location?.join_url ?? null;
  const email = payload.email ?? null;
  const displayName =
    payload.name ??
    [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim() ??
    null;
  const phone = extractPhone(payload);
  const cancelReason = payload.cancellation?.reason ?? null;

  // ── Lead finden oder anlegen ────────────────────────────────────────────────
  const match = await findExistingLeadForManual(db, {
    email,
    phone,
    company_name: displayName,
  });

  let leadId: string;
  let leadArchived = false;
  if (match) {
    leadId = match.leadId;
    leadArchived = match.archived;
  } else {
    // Kein Treffer → neuen Lead anlegen (created_by=null, System). company_name ist
    // Pflicht → Fallback-Kette Name → E-Mail → generisch.
    const companyName = (displayName || email || "Calendly-Buchung").trim();
    const { data, error } = await db
      .from("leads")
      .insert({
        company_name: companyName,
        email: normalizeEmail(email),
        phone: normalizePhone(phone),
        country: "Deutschland",
        source_type: "manual",
        status: "qualified",
        crm_status_id: null,
        created_by: null,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[calendly:ingest] lead insert failed:", error);
      return { ok: false, info: `lead insert failed: ${error?.message ?? "unknown"}` };
    }
    leadId = data.id as string;
    await logAudit({
      userId: null,
      action: "lead.created_manual",
      entityType: "lead",
      entityId: leadId,
      details: { company_name: companyName, source: "calendly" },
    });
  }

  // ── Status gemäß Mapping setzen ─────────────────────────────────────────────
  const targetStatusId = eventTypeUri
    ? await resolveMappedStatus(db, eventTypeUri, isCancel ? "canceled" : "booked")
    : null;

  let statusChangedTo: string | null = null;
  if (targetStatusId && !leadArchived) {
    const { data: before } = await db
      .from("leads")
      .select("crm_status_id")
      .eq("id", leadId)
      .maybeSingle();
    const currentStatusId = before?.crm_status_id ?? null;

    // „Nur vorwärts": Status nur setzen, wenn der Ziel-Status in der Pipeline
    // weiter vorne liegt (höhere display_order) als der aktuelle. So wird ein
    // Lead, der bereits bei Closing/Gewonnen ist, durch eine Setting-Buchung
    // NICHT zurückgestuft. Ist noch kein Status gesetzt → immer setzen.
    const [currentOrder, targetOrder] = await Promise.all([
      getStatusOrder(db, currentStatusId),
      getStatusOrder(db, targetStatusId),
    ]);
    const isForward =
      currentStatusId === null ||
      currentOrder === null ||
      (targetOrder !== null && targetOrder > currentOrder);

    if (currentStatusId !== targetStatusId && isForward) {
      const { error: updErr } = await db
        .from("leads")
        .update({ crm_status_id: targetStatusId, updated_at: new Date().toISOString() })
        .eq("id", leadId);
      if (!updErr) {
        statusChangedTo = targetStatusId;
        await logAudit({
          userId: null,
          action: "lead.crm_status_changed",
          entityType: "lead",
          entityId: leadId,
          details: {
            old_status: currentStatusId,
            new_status: targetStatusId,
            source: "calendly",
          },
        });
      } else {
        console.error("[calendly:ingest] status update failed:", updErr);
      }
    }
  }

  // ── Termin upserten (idempotent) ────────────────────────────────────────────
  const apptStatus = isCancel ? "canceled" : "booked";
  const { error: apptErr } = await db.from("lead_appointments").upsert(
    {
      lead_id: leadId,
      calendly_invitee_uri: inviteeUri,
      calendly_event_uri: scheduled?.uri ?? null,
      event_type_uri: eventTypeUri,
      event_type_name: eventTypeName,
      invitee_email: email,
      invitee_name: displayName,
      status: apptStatus,
      scheduled_at: scheduledAt,
      join_url: joinUrl,
      cancel_reason: cancelReason,
      raw: event as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "calendly_invitee_uri" },
  );
  if (apptErr) {
    console.error("[calendly:ingest] appointment upsert failed:", apptErr);
    // Kein harter Fehler — der Status/Lead ist bereits gesetzt; wir loggen trotzdem.
  }

  // ── Buchung → passenden Deal automatisch anlegen ────────────────────────────
  // Regelbasiert nach Event-Name (siehe AUTO_DEAL_RULES). Max. ein aktiver Deal pro
  // (Lead, Titel) — idempotent gegen Retries/Reschedules. Best-effort: ein Fehler darf
  // Lead/Status/Termin nicht kippen.
  let createdDeal = false;
  const dealRule = isCreate && !leadArchived ? matchAutoDealRule(eventTypeName) : null;
  if (dealRule) {
    try {
      const { data: existing } = await db
        .from("deals")
        .select("id")
        .eq("lead_id", leadId)
        .eq("title", dealRule.title)
        .is("deleted_at", null)
        .maybeSingle();
      if (!existing) {
        const { data: leadRow } = await db
          .from("leads")
          .select("company_name, vertical")
          .eq("id", leadId)
          .maybeSingle();
        const res = await createDeal({
          leadId,
          companyName: (leadRow?.company_name as string | null) ?? displayName ?? "—",
          title: dealRule.title,
          amountCents: dealRule.amountCents,
          stageId: APPOINTMENT_STATUS_ID,
          assignedTo: null,
          expectedCloseDate: null,
          createdBy: null,
        });
        if ("id" in res) {
          createdDeal = true;
          // Lead korrekt einordnen: Vertical (sonst nicht auf dem passenden CRM-Board
          // sichtbar) + Lifecycle lead→deal — analog createDealAction.
          if (leadRow && !leadRow.vertical) {
            await db.from("leads").update({ vertical: dealRule.vertical }).eq("id", leadId);
          }
          await db
            .from("leads")
            .update({ lifecycle_stage: "deal" })
            .eq("id", leadId)
            .eq("lifecycle_stage", "lead");
          await logAudit({
            userId: null,
            action: "deal.created",
            entityType: "deal",
            entityId: res.id,
            details: {
              title: dealRule.title,
              amount_cents: dealRule.amountCents,
              lead_id: leadId,
              source: "calendly",
            },
          });
        } else {
          console.error("[calendly:ingest] auto-deal failed:", res.error);
        }
      }
    } catch (e) {
      console.error("[calendly:ingest] auto-deal exception:", e);
    }
  }

  // ── Historien-Eintrag ───────────────────────────────────────────────────────
  await logAudit({
    userId: null,
    action: isCancel ? "lead.appointment_canceled" : "lead.appointment_booked",
    entityType: "lead",
    entityId: leadId,
    details: {
      event_type_name: eventTypeName,
      scheduled_at: scheduledAt,
      join_url: joinUrl,
      invitee_email: email,
      invitee_name: displayName,
      cancel_reason: cancelReason,
      status_set: statusChangedTo,
      created_lead: !match,
      created_deal: createdDeal,
      deal_title: dealRule?.title ?? null,
      source: "calendly",
    },
  });

  return {
    ok: true,
    info: `${apptStatus} → lead ${leadId}${match ? "" : " (new)"}`,
    leadId,
  };
}

/** Liest den gemappten Ziel-Status für einen Event-Typ (oder null). */
async function resolveMappedStatus(
  db: ReturnType<typeof createServiceClient>,
  eventTypeUri: string,
  kind: "booked" | "canceled",
): Promise<string | null> {
  const { data } = await db
    .from("calendly_event_mappings")
    .select("booked_status_id, canceled_status_id, is_active")
    .eq("event_type_uri", eventTypeUri)
    .maybeSingle();
  if (!data || data.is_active === false) return null;
  return (kind === "booked" ? data.booked_status_id : data.canceled_status_id) ?? null;
}

/** display_order eines Status (für die Vorwärts-Prüfung), oder null. */
async function getStatusOrder(
  db: ReturnType<typeof createServiceClient>,
  statusId: string | null,
): Promise<number | null> {
  if (!statusId) return null;
  const { data } = await db
    .from("custom_lead_statuses")
    .select("display_order")
    .eq("id", statusId)
    .maybeSingle();
  return (data?.display_order as number | null) ?? null;
}

/** Zieht eine Telefonnummer aus den Calendly-Feldern (Reminder-Nummer oder Q&A). */
function extractPhone(payload: CalendlyInviteePayload): string | null {
  if (payload.text_reminder_number) return payload.text_reminder_number;
  for (const qa of payload.questions_and_answers ?? []) {
    const q = (qa.question ?? "").toLowerCase();
    if (/tel|phone|handy|mobil|nummer/.test(q) && qa.answer) return qa.answer;
  }
  return null;
}
