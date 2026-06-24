"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { checkSection } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";
import {
  buildEmploymentLink,
  sendEmploymentLinkEmail,
} from "@/lib/email/central";
import {
  renderEmploymentPdf,
  uploadEmploymentPdf,
  getContractFileSignedUrl,
  downloadContractFile,
  loadProviderSignatureForPdf,
} from "@/lib/employment/pdf";
import { buildEmploymentRenderInput, loadEmploymentContract } from "@/lib/employment/data";
import { EMPLOYMENT_TEMPLATE_VERSION } from "@/lib/employment/template";
import { isContractEditable } from "@/lib/contracts/types";
import { employeeName } from "@/lib/employment/types";
import type {
  EmploymentContractRow,
  EmploymentEventType,
  EmploymentVariant,
  NoticePeriodModel,
  PayModel,
} from "@/lib/employment/types";

const LINK_VALID_DAYS = 30;

type Result<T = unknown> = ({ success: true } & T) | { error: string };

async function writeEvent(
  contractId: string,
  event: EmploymentEventType,
  actorUserId: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const db = createServiceClient();
  await db.from("employment_contract_events").insert({
    employment_contract_id: contractId,
    event,
    actor_user_id: actorUserId,
    meta,
  });
}

function buildTermsSnapshot(row: EmploymentContractRow): Record<string, unknown> {
  return {
    template_version: EMPLOYMENT_TEMPLATE_VERSION,
    variant: row.variant,
    pay_model: row.pay_model,
    hourly_wage_cents: row.hourly_wage_cents,
    monthly_salary_cents: row.monthly_salary_cents,
    commission_per_appointment_cents: row.commission_per_appointment_cents,
    weekly_hours: row.weekly_hours,
    workdays_per_week: row.workdays_per_week,
    vacation_days: row.vacation_days,
    probation_months: row.probation_months,
    start_date: row.start_date,
    fixed_term: row.fixed_term,
    end_date: row.end_date,
    travel_cost_reimbursed: row.travel_cost_reimbursed,
    notice_period_model: row.notice_period_model,
    frozen_at: new Date().toISOString(),
  };
}

export interface EmploymentInput {
  variant: EmploymentVariant;
  employee: {
    firstName: string;
    lastName: string;
    street?: string;
    zip?: string;
    city?: string;
    email?: string;
  };
  start_date?: string | null;
  fixed_term?: boolean;
  end_date?: string | null;
  probation_months: number;
  pay_model: PayModel;
  hourly_wage_cents: number;
  monthly_salary_cents: number;
  commission_per_appointment_cents: number;
  weekly_hours: number;
  workdays_per_week: number;
  vacation_days: number;
  travel_cost_reimbursed: boolean;
  notice_period_model: NoticePeriodModel;
}

function validate(input: EmploymentInput): string | null {
  if (!input.employee.firstName?.trim() || !input.employee.lastName?.trim()) {
    return "Bitte Vor- und Nachname des Mitarbeiters angeben.";
  }
  if (input.pay_model === "hourly" && (!Number.isFinite(input.hourly_wage_cents) || input.hourly_wage_cents <= 0)) {
    return "Bitte einen gültigen Stundenlohn angeben.";
  }
  if (input.pay_model === "monthly" && (!Number.isFinite(input.monthly_salary_cents) || input.monthly_salary_cents <= 0)) {
    return "Bitte ein gültiges Monatsgehalt angeben.";
  }
  if (input.fixed_term && !input.end_date) {
    return "Bei Befristung bitte ein Enddatum angeben.";
  }
  return null;
}

function toColumns(input: EmploymentInput) {
  const t = (v: string | undefined | null) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };
  return {
    variant: input.variant,
    employee_first_name: t(input.employee.firstName),
    employee_last_name: t(input.employee.lastName),
    employee_street: t(input.employee.street),
    employee_zip: t(input.employee.zip),
    employee_city: t(input.employee.city),
    employee_email: t(input.employee.email),
    start_date: input.start_date || null,
    fixed_term: !!input.fixed_term,
    end_date: input.fixed_term ? input.end_date || null : null,
    probation_months: Math.max(0, Math.round(input.probation_months)),
    pay_model: input.pay_model,
    hourly_wage_cents: input.pay_model === "hourly" ? Math.round(input.hourly_wage_cents) : 0,
    monthly_salary_cents: input.pay_model === "monthly" ? Math.round(input.monthly_salary_cents) : 0,
    commission_per_appointment_cents: Math.max(0, Math.round(input.commission_per_appointment_cents)),
    weekly_hours: input.weekly_hours,
    workdays_per_week: Math.max(1, Math.round(input.workdays_per_week)),
    vacation_days: Math.max(0, Math.round(input.vacation_days)),
    travel_cost_reimbursed: !!input.travel_cost_reimbursed,
    notice_period_model: input.notice_period_model,
  };
}

export async function createEmploymentContract(input: EmploymentInput): Promise<Result<{ id: string }>> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const err = validate(input);
  if (err) return { error: err };

  const db = createServiceClient();
  const { data, error } = await db
    .from("employment_contracts")
    .insert({ ...toColumns(input), status: "draft", created_by: ctx.user.id })
    .select("id")
    .single();
  if (error) {
    console.error("[createEmploymentContract]", error);
    return { error: `DB-Fehler: ${error.message}` };
  }
  const id = data.id as string;
  await writeEvent(id, "created", ctx.user.id);
  await logAudit({ userId: ctx.user.id, action: "employment.create", entityType: "employment_contract", entityId: id });
  revalidatePath("/vertraege/arbeit");
  return { success: true, id };
}

export async function updateEmploymentDraft(id: string, input: EmploymentInput): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const err = validate(input);
  if (err) return { error: err };

  const row = await loadEmploymentContract(id);
  if (!row) return { error: "Arbeitsvertrag nicht gefunden." };
  if (!isContractEditable(row)) {
    return { error: "Nur Entwürfe oder Verträge mit aktivem Link können bearbeitet werden." };
  }

  const cols = toColumns(input);
  const update: Record<string, unknown> = { ...cols };
  if (row.status === "sent" && !row.sent_at) {
    update.terms_snapshot = buildTermsSnapshot({ ...row, ...cols } as EmploymentContractRow);
  }

  const db = createServiceClient();
  const { error: updErr } = await db.from("employment_contracts").update(update).eq("id", id);
  if (updErr) return { error: `DB-Fehler: ${updErr.message}` };
  revalidatePath(`/vertraege/arbeit/${id}`);
  revalidatePath("/vertraege/arbeit");
  return { success: true };
}

/** Erzeugt/aktiviert den Signier-Link OHNE E-Mail-Versand — zum manuellen Teilen. */
export async function createEmploymentLink(id: string): Promise<Result<{ link: string }>> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const row = await loadEmploymentContract(id);
  if (!row) return { error: "Arbeitsvertrag nicht gefunden." };
  if (row.status === "signed") return { error: "Vertrag ist bereits unterschrieben." };
  if (row.status === "cancelled") return { error: "Vertrag ist storniert." };

  const token = row.token ?? crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_VALID_DAYS * 86_400_000);
  const update: Record<string, unknown> = { token, expires_at: expiresAt.toISOString() };
  if (row.status === "draft") {
    update.status = "sent"; // sent_at bleibt leer → "Link aktiv"
    update.terms_snapshot = buildTermsSnapshot(row);
  }

  const db = createServiceClient();
  const { error: updErr } = await db.from("employment_contracts").update(update).eq("id", id);
  if (updErr) return { error: `DB-Fehler: ${updErr.message}` };

  await writeEvent(id, "sent", ctx.user.id, { channel: "link" });
  await logAudit({ userId: ctx.user.id, action: "employment.link", entityType: "employment_contract", entityId: id });
  revalidatePath(`/vertraege/arbeit/${id}`);
  revalidatePath("/vertraege/arbeit");
  return { success: true, link: buildEmploymentLink(token) };
}

/** Aktiviert den Link und versendet ihn per E-Mail an den Mitarbeiter. */
export async function sendEmploymentContract(id: string): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const row = await loadEmploymentContract(id);
  if (!row) return { error: "Arbeitsvertrag nicht gefunden." };
  if (row.status === "signed") return { error: "Vertrag ist bereits unterschrieben." };
  if (row.status === "cancelled") return { error: "Vertrag ist storniert." };
  const to = row.employee_email;
  if (!to) return { error: "Keine E-Mail-Adresse beim Mitarbeiter hinterlegt." };

  const isResend = !!row.token && (row.status === "sent" || row.status === "viewed");
  const token = row.token ?? crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_VALID_DAYS * 86_400_000);

  const db = createServiceClient();
  const { error: updErr } = await db
    .from("employment_contracts")
    .update({
      token,
      status: "sent",
      sent_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      terms_snapshot: buildTermsSnapshot(row),
    })
    .eq("id", id);
  if (updErr) return { error: `DB-Fehler: ${updErr.message}` };

  const mail = await sendEmploymentLinkEmail({
    to,
    employeeName: employeeName(row),
    link: buildEmploymentLink(token),
    expiresAt,
  });
  if (!mail.ok) {
    await writeEvent(id, isResend ? "resent" : "sent", ctx.user.id, { email_error: mail.error, to });
    revalidatePath(`/vertraege/arbeit/${id}`);
    return { error: `Vertrag vorbereitet, aber E-Mail fehlgeschlagen: ${mail.error}` };
  }
  await writeEvent(id, isResend ? "resent" : "sent", ctx.user.id, { to });
  await logAudit({ userId: ctx.user.id, action: "employment.send", entityType: "employment_contract", entityId: id });
  revalidatePath(`/vertraege/arbeit/${id}`);
  revalidatePath("/vertraege/arbeit");
  return { success: true };
}

export async function cancelEmploymentContract(id: string): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const row = await loadEmploymentContract(id);
  if (!row) return { error: "Arbeitsvertrag nicht gefunden." };
  if (row.status === "cancelled") return { error: "Vertrag ist bereits storniert." };
  const db = createServiceClient();
  const { error } = await db.from("employment_contracts").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await writeEvent(id, "cancelled", ctx.user.id);
  await logAudit({ userId: ctx.user.id, action: "employment.cancel", entityType: "employment_contract", entityId: id });
  revalidatePath(`/vertraege/arbeit/${id}`);
  revalidatePath("/vertraege/arbeit");
  return { success: true };
}

export async function deleteEmploymentContract(id: string): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const row = await loadEmploymentContract(id);
  if (!row) return { error: "Arbeitsvertrag nicht gefunden." };
  // Anders als bei Kundenverträgen: interne Arbeitsverträge dürfen in jedem
  // Status gelöscht werden (auch unterschrieben) — der Arbeitgeber besitzt das
  // Dokument selbst. Zugehörige Storage-Dateien + Fragebogen werden mit entfernt.
  const db = createServiceClient();
  // Storage-Dateien (Signatur/PDFs) best effort entfernen.
  const paths = [
    row.signature_path,
    row.pdf_path,
    `employment/${id}/personalfragebogen.pdf`,
  ].filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: rmErr } = await db.storage.from("contracts").remove(paths);
    if (rmErr) console.error("[deleteEmploymentContract:storage]", rmErr);
  }
  const { error } = await db.from("employment_contracts").delete().eq("id", id);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await logAudit({ userId: ctx.user.id, action: "employment.delete", entityType: "employment_contract", entityId: id });
  revalidatePath("/vertraege/arbeit");
  return { success: true };
}

async function buildSignatureForPdf(
  row: EmploymentContractRow,
): Promise<{ dataUrl: string; signedAt: string; signerName: string } | null> {
  if (!row.signature_path) return null;
  const buf = await downloadContractFile(row.signature_path);
  if (!buf) return null;
  return {
    dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
    signedAt: row.signed_at ? new Date(row.signed_at).toLocaleDateString("de-DE") : "",
    signerName: employeeName(row),
  };
}

/** Liefert eine signed URL zum Vertrags-PDF; generiert es nach, falls es fehlt. */
export async function getEmploymentPdfUrl(id: string): Promise<Result<{ url: string }>> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const row = await loadEmploymentContract(id);
  if (!row) return { error: "Arbeitsvertrag nicht gefunden." };
  if (row.status !== "signed") return { error: "Vertrag ist noch nicht unterschrieben." };

  let pdfPath = row.pdf_path;
  if (!pdfPath) {
    const signature = await buildSignatureForPdf(row);
    const providerSignature = await loadProviderSignatureForPdf();
    const input = buildEmploymentRenderInput(row, { mode: "pdf", signature, providerSignature });
    try {
      const buffer = await renderEmploymentPdf(input);
      const up = await uploadEmploymentPdf(id, buffer);
      if ("error" in up) return { error: up.error };
      pdfPath = up.path;
      const db = createServiceClient();
      await db.from("employment_contracts").update({ pdf_path: pdfPath }).eq("id", id);
    } catch (e) {
      console.error("[getEmploymentPdfUrl:render]", e);
      return { error: "PDF konnte nicht erzeugt werden." };
    }
  }
  const url = await getContractFileSignedUrl(pdfPath, 3600);
  if (!url) return { error: "Signed URL konnte nicht erzeugt werden." };
  await writeEvent(id, "downloaded", ctx.user.id);
  return { success: true, url };
}

/** Liefert eine signed URL zum ausgefüllten Personalfragebogen-PDF. */
export async function getQuestionnairePdfUrl(id: string): Promise<Result<{ url: string }>> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const db = createServiceClient();
  const { data } = await db
    .from("employment_questionnaires")
    .select("pdf_path, status")
    .eq("employment_contract_id", id)
    .maybeSingle();
  const pdfPath = (data as { pdf_path: string | null } | null)?.pdf_path;
  if (!pdfPath) return { error: "Personalfragebogen wurde noch nicht ausgefüllt." };
  const url = await getContractFileSignedUrl(pdfPath, 3600);
  if (!url) return { error: "Signed URL konnte nicht erzeugt werden." };
  return { success: true, url };
}
