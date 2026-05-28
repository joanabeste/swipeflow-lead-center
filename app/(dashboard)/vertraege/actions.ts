"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { checkSection } from "@/lib/auth";
import { logAudit } from "@/lib/audit-log";
import { sendContractLinkEmail, buildContractLink } from "@/lib/email/central";
import { renderContractPdf, uploadContractPdf } from "@/lib/contracts/pdf";
import { buildRenderInput, decryptIban } from "@/lib/contracts/render";
import { loadCreditor, saveCreditor } from "@/lib/contracts/settings";
import { getContractFileSignedUrl } from "@/lib/contracts/pdf";
import { TEMPLATE_VERSION } from "@/lib/contracts/template";
import type { ContractRow, ContractLead, ContractEventType, PaymentMode, PaymentMethod } from "@/lib/contracts/types";

const LINK_VALID_DAYS = 30;

type Result<T = unknown> = ({ success: true } & T) | { error: string };

async function writeEvent(
  contractId: string,
  event: ContractEventType,
  actorUserId: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const db = createServiceClient();
  await db.from("contract_events").insert({
    contract_id: contractId,
    event,
    actor_user_id: actorUserId,
    meta,
  });
}

/** Friert die Konditionen beim Aktivieren des Links/Versand ein. */
function buildTermsSnapshot(contract: ContractRow, creditorId: string): Record<string, unknown> {
  return {
    template_version: TEMPLATE_VERSION,
    setup_price_cents: contract.setup_price_cents,
    monthly_maint_cents: contract.monthly_maint_cents,
    payment_mode: contract.payment_mode,
    installment_count: contract.installment_count,
    payment_method: contract.payment_method,
    creditor_id: creditorId,
    frozen_at: new Date().toISOString(),
  };
}

export interface BillingInput {
  company?: string;
  street?: string;
  zip?: string;
  city?: string;
  email?: string;
  country?: string;
}

/** Wandelt das Adress-Formular in DB-Spalten (leer → null). */
function normBilling(b: BillingInput | undefined) {
  const t = (v: string | undefined) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };
  return {
    billing_company: t(b?.company),
    billing_street: t(b?.street),
    billing_zip: t(b?.zip),
    billing_city: t(b?.city),
    billing_email: t(b?.email),
    billing_country: t(b?.country),
  };
}

export interface CreateContractInput {
  lead_id?: string;
  /** Alternativ zu lead_id: neuen Kunden anlegen. */
  new_customer?: { company_name: string; city?: string; email?: string };
  type?: "webdesign" | "recruiting";
  setup_price_cents: number;
  monthly_maint_cents: number;
  payment_mode: PaymentMode;
  installment_count?: number | null;
  payment_method: PaymentMethod;
  billing?: BillingInput;
}

export async function createContract(input: CreateContractInput): Promise<Result<{ id: string }>> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  if (!Number.isFinite(input.setup_price_cents) || input.setup_price_cents < 0) {
    return { error: "Ungültiger Herstellungspreis." };
  }
  if (input.payment_mode === "raten" && (!input.installment_count || input.installment_count < 2)) {
    return { error: "Bei Ratenzahlung mindestens 2 Raten angeben." };
  }

  const db = createServiceClient();

  // Kunde auflösen oder neu anlegen.
  let leadId = input.lead_id;
  if (!leadId) {
    const nc = input.new_customer;
    if (!nc?.company_name?.trim()) return { error: "Kein Kunde ausgewählt oder angelegt." };
    const { data: leadData, error: leadErr } = await db
      .from("leads")
      .insert({
        company_name: nc.company_name.trim(),
        city: nc.city?.trim() || null,
        email: nc.email?.trim() || null,
        vertical: "webdesign",
        source_type: "manual",
        status: "imported",
        lifecycle_stage: "customer",
        became_customer_at: new Date().toISOString(),
        created_by: ctx.user.id,
      })
      .select("id")
      .single();
    if (leadErr) {
      console.error("[createContract:newCustomer]", leadErr);
      return { error: `Kunde konnte nicht angelegt werden: ${leadErr.message}` };
    }
    leadId = leadData.id as string;
  } else {
    // Aus dem CRM gewählter Lead, der noch kein Kunde ist → zum Kunden befördern.
    // neq stellt sicher, dass became_customer_at bestehender Kunden nicht überschrieben wird.
    const { error: promoteErr } = await db
      .from("leads")
      .update({ lifecycle_stage: "customer", became_customer_at: new Date().toISOString() })
      .eq("id", leadId)
      .neq("lifecycle_stage", "customer");
    if (promoteErr) console.error("[createContract:promote]", promoteErr);
  }

  const { data, error } = await db
    .from("contracts")
    .insert({
      lead_id: leadId,
      type: input.type ?? "webdesign",
      status: "draft",
      setup_price_cents: Math.round(input.setup_price_cents),
      monthly_maint_cents: Math.round(input.monthly_maint_cents),
      payment_mode: input.payment_mode,
      installment_count: input.payment_mode === "raten" ? input.installment_count : null,
      payment_method: input.payment_method,
      ...normBilling(input.billing),
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[createContract]", error);
    return { error: `DB-Fehler: ${error.message}` };
  }

  const id = data.id as string;
  await writeEvent(id, "created", ctx.user.id);
  await logAudit({ userId: ctx.user.id, action: "contract.create", entityType: "contract", entityId: id });
  revalidatePath("/vertraege");
  return { success: true, id };
}

export interface UpdateDraftInput {
  setup_price_cents: number;
  monthly_maint_cents: number;
  payment_mode: PaymentMode;
  installment_count?: number | null;
  payment_method: PaymentMethod;
  billing?: BillingInput;
}

export async function updateContractDraft(id: string, input: UpdateDraftInput): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  if (!Number.isFinite(input.setup_price_cents) || input.setup_price_cents < 0) {
    return { error: "Ungültiger Herstellungspreis." };
  }
  if (input.payment_mode === "raten" && (!input.installment_count || input.installment_count < 2)) {
    return { error: "Bei Ratenzahlung mindestens 2 Raten angeben." };
  }

  const contract = await loadRow(id);
  if (!contract) return { error: "Vertrag nicht gefunden." };
  if (contract.status !== "draft") return { error: "Nur Entwürfe können bearbeitet werden." };

  const db = createServiceClient();
  const { error } = await db
    .from("contracts")
    .update({
      setup_price_cents: Math.round(input.setup_price_cents),
      monthly_maint_cents: Math.round(input.monthly_maint_cents),
      payment_mode: input.payment_mode,
      installment_count: input.payment_mode === "raten" ? input.installment_count : null,
      payment_method: input.payment_method,
      ...normBilling(input.billing),
    })
    .eq("id", id);
  if (error) {
    console.error("[updateContractDraft]", error);
    return { error: `DB-Fehler: ${error.message}` };
  }
  revalidatePath(`/vertraege/${id}`);
  revalidatePath("/vertraege");
  return { success: true };
}

async function loadRow(id: string): Promise<ContractRow | null> {
  const db = createServiceClient();
  const { data } = await db.from("contracts").select("*").eq("id", id).maybeSingle();
  return (data as unknown as ContractRow | null) ?? null;
}

async function loadLead(leadId: string): Promise<ContractLead | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("leads")
    .select("id, company_name, street, zip, city, email")
    .eq("id", leadId)
    .maybeSingle();
  return (data as ContractLead | null) ?? null;
}

export async function sendContract(id: string): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };

  const contract = await loadRow(id);
  if (!contract) return { error: "Vertrag nicht gefunden." };
  if (contract.status === "signed") return { error: "Vertrag ist bereits unterschrieben." };
  if (contract.status === "cancelled") return { error: "Vertrag ist storniert." };

  const lead = await loadLead(contract.lead_id);
  const to = contract.billing_email || lead?.email;
  if (!to) return { error: "Keine E-Mail-Adresse beim Kunden hinterlegt." };

  const isResend = !!contract.token && (contract.status === "sent" || contract.status === "viewed");
  const token = contract.token ?? crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_VALID_DAYS * 86_400_000);
  const creditor = await loadCreditor();

  const db = createServiceClient();
  const { error: updErr } = await db
    .from("contracts")
    .update({
      token,
      status: "sent",
      sent_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      terms_snapshot: buildTermsSnapshot(contract, creditor.id),
    })
    .eq("id", id);
  if (updErr) {
    console.error("[sendContract:update]", updErr);
    return { error: `DB-Fehler: ${updErr.message}` };
  }

  const link = buildContractLink(token);
  const mail = await sendContractLinkEmail({
    to,
    customerName: contract.billing_company || lead?.company_name || "",
    link,
    expiresAt,
  });
  if (!mail.ok) {
    // Token/Status stehen bereits — Link kann manuell geteilt werden. Fehler melden.
    await writeEvent(id, isResend ? "resent" : "sent", ctx.user.id, { email_error: mail.error, to });
    revalidatePath(`/vertraege/${id}`);
    return { error: `Vertrag vorbereitet, aber E-Mail fehlgeschlagen: ${mail.error}` };
  }

  await writeEvent(id, isResend ? "resent" : "sent", ctx.user.id, { to });
  await logAudit({ userId: ctx.user.id, action: "contract.send", entityType: "contract", entityId: id });
  revalidatePath(`/vertraege/${id}`);
  revalidatePath("/vertraege");
  return { success: true };
}

/** Erzeugt/aktiviert den Signier-Link OHNE E-Mail-Versand — zum manuellen Teilen.
 *  Anders als sendContract braucht es keine hinterlegte E-Mail. */
export async function createContractLink(id: string): Promise<Result<{ link: string }>> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };

  const contract = await loadRow(id);
  if (!contract) return { error: "Vertrag nicht gefunden." };
  if (contract.status === "signed") return { error: "Vertrag ist bereits unterschrieben." };
  if (contract.status === "cancelled") return { error: "Vertrag ist storniert." };

  const token = contract.token ?? crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_VALID_DAYS * 86_400_000);

  // Entwurf → aktivieren (Status + Snapshot einfrieren). Bereits gesendete
  // Verträge behalten Status/Snapshot, nur die Gültigkeit wird verlängert.
  const update: Record<string, unknown> = { token, expires_at: expiresAt.toISOString() };
  if (contract.status === "draft") {
    const creditor = await loadCreditor();
    update.status = "sent";
    // sent_at bleibt bewusst leer — es kennzeichnet ausschließlich echten E-Mail-Versand.
    // Reine Link-Verträge erscheinen dadurch als "Link aktiv" statt "Gesendet".
    update.terms_snapshot = buildTermsSnapshot(contract, creditor.id);
  }

  const db = createServiceClient();
  const { error: updErr } = await db.from("contracts").update(update).eq("id", id);
  if (updErr) {
    console.error("[createContractLink:update]", updErr);
    return { error: `DB-Fehler: ${updErr.message}` };
  }

  await writeEvent(id, "sent", ctx.user.id, { channel: "link" });
  await logAudit({ userId: ctx.user.id, action: "contract.link", entityType: "contract", entityId: id });
  revalidatePath(`/vertraege/${id}`);
  revalidatePath("/vertraege");
  return { success: true, link: buildContractLink(token) };
}

export async function extendContract(id: string): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const contract = await loadRow(id);
  if (!contract) return { error: "Vertrag nicht gefunden." };
  if (contract.status === "signed" || contract.status === "cancelled") {
    return { error: "Vertrag kann nicht verlängert werden." };
  }

  const expiresAt = new Date(Date.now() + LINK_VALID_DAYS * 86_400_000);
  const db = createServiceClient();
  const { error } = await db.from("contracts").update({ expires_at: expiresAt.toISOString() }).eq("id", id);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await writeEvent(id, "extended", ctx.user.id, { until: expiresAt.toISOString() });
  revalidatePath(`/vertraege/${id}`);
  return { success: true };
}

export async function cancelContract(id: string): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const contract = await loadRow(id);
  if (!contract) return { error: "Vertrag nicht gefunden." };
  if (contract.status === "signed") return { error: "Unterschriebene Verträge können nicht storniert werden." };

  const db = createServiceClient();
  const { error } = await db.from("contracts").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: `DB-Fehler: ${error.message}` };
  await writeEvent(id, "cancelled", ctx.user.id);
  await logAudit({ userId: ctx.user.id, action: "contract.cancel", entityType: "contract", entityId: id });
  revalidatePath(`/vertraege/${id}`);
  revalidatePath("/vertraege");
  return { success: true };
}

/** Löscht einen Vertrag endgültig — nur für Entwürfe oder stornierte Verträge.
 *  Entfernt zugehörige Storage-Dateien; contract_events folgen per CASCADE. */
export async function deleteContract(id: string): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const contract = await loadRow(id);
  if (!contract) return { error: "Vertrag nicht gefunden." };
  if (contract.status !== "draft" && contract.status !== "cancelled") {
    return { error: "Nur Entwürfe oder stornierte Verträge können gelöscht werden." };
  }

  const db = createServiceClient();

  // Storage-Dateien (Signatur/PDF) entfernen, falls vorhanden — best effort.
  const paths = [contract.signature_path, contract.pdf_path].filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: rmErr } = await db.storage.from("contracts").remove(paths);
    if (rmErr) console.error("[deleteContract:storage]", rmErr);
  }

  const { error } = await db.from("contracts").delete().eq("id", id);
  if (error) {
    console.error("[deleteContract]", error);
    return { error: `DB-Fehler: ${error.message}` };
  }
  await logAudit({ userId: ctx.user.id, action: "contract.delete", entityType: "contract", entityId: id });
  revalidatePath("/vertraege");
  return { success: true };
}

export interface CreditorInput {
  id: string;
  name: string;
  address: string;
}

/** Speichert die eigenen SEPA-Gläubigerdaten (Verträge → Einstellungen). */
export async function updateCreditorSettings(input: CreditorInput): Promise<Result> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const res = await saveCreditor({
    id: input.id,
    name: input.name,
    address: input.address,
    updatedBy: ctx.user.id,
  });
  if (res.error) return { error: `DB-Fehler: ${res.error}` };
  await logAudit({ userId: ctx.user.id, action: "contract.settings", entityType: "company_settings", entityId: "default" });
  revalidatePath("/vertraege/einstellungen");
  return { success: true };
}

/** Liefert eine signed URL zum PDF. Generiert das PDF nach, falls es fehlt. */
export async function getContractPdfUrl(id: string): Promise<Result<{ url: string }>> {
  const ctx = await checkSection("can_vertraege");
  if (!ctx) return { error: "Nicht berechtigt." };
  const contract = await loadRow(id);
  if (!contract) return { error: "Vertrag nicht gefunden." };
  if (contract.status !== "signed") return { error: "Vertrag ist noch nicht unterschrieben." };

  let pdfPath = contract.pdf_path;
  if (!pdfPath) {
    const lead = await loadLead(contract.lead_id);
    const ibanPlain = decryptIban(contract);
    const creditor = await loadCreditor();
    const signature = contract.signature_path
      ? await buildSignatureForPdf(contract)
      : null;
    const input = buildRenderInput(contract, lead, { mode: "pdf", creditor, signature, ibanPlain });
    try {
      const buffer = await renderContractPdf(input);
      const up = await uploadContractPdf(id, buffer);
      if ("error" in up) return { error: up.error };
      pdfPath = up.path;
      const db = createServiceClient();
      await db.from("contracts").update({ pdf_path: pdfPath }).eq("id", id);
    } catch (e) {
      console.error("[getContractPdfUrl:render]", e);
      return { error: "PDF konnte nicht erzeugt werden." };
    }
  }

  const url = await getContractFileSignedUrl(pdfPath, 3600);
  if (!url) return { error: "Signed URL konnte nicht erzeugt werden." };
  await writeEvent(id, "downloaded", ctx.user.id);
  return { success: true, url };
}

/** Lädt das Signatur-PNG aus dem Bucket und baut den Signatur-Block fürs PDF. */
async function buildSignatureForPdf(
  contract: ContractRow,
): Promise<{ dataUrl: string; signedAt: string; signerName: string } | null> {
  if (!contract.signature_path) return null;
  const { downloadContractFile } = await import("@/lib/contracts/pdf");
  const buf = await downloadContractFile(contract.signature_path);
  if (!buf) return null;
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  return {
    dataUrl,
    signedAt: contract.signed_at ? new Date(contract.signed_at).toLocaleDateString("de-DE") : "",
    signerName: contract.sepa_account_holder || contract.billing_company || "",
  };
}
