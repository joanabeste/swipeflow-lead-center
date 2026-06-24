"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secrets";
import { ibanLast4, isValidIban, normalizeIban } from "@/lib/contracts/format";
import {
  renderEmploymentPdf,
  uploadEmploymentPdf,
  uploadEmploymentSignaturePng,
  renderQuestionnairePdf,
  uploadQuestionnairePdf,
  loadProviderSignatureForPdf,
  getContractFileSignedUrl,
} from "@/lib/employment/pdf";
import { buildEmploymentRenderInput } from "@/lib/employment/data";
import { renderEmploymentContractHtml } from "@/lib/employment/template";
import {
  buildEmploymentAdminUrl,
  sendEmploymentSignedNotifyEmail,
  sendQuestionnaireSubmittedNotifyEmail,
} from "@/lib/email/central";
import { employeeName, type EmploymentContractRow, type QuestionnaireData } from "@/lib/employment/types";

type Result<T = unknown> = ({ success: true } & T) | { error: string };

async function loadByToken(token: string): Promise<EmploymentContractRow | null> {
  const db = createServiceClient();
  const { data } = await db.from("employment_contracts").select("*").eq("token", token).maybeSingle();
  return (data as unknown as EmploymentContractRow | null) ?? null;
}

function isExpired(row: EmploymentContractRow): boolean {
  if (!row.expires_at) return false;
  if (row.status === "signed" || row.status === "cancelled") return false;
  return new Date(row.expires_at).getTime() < Date.now();
}

export interface EmployeeFields {
  first_name: string;
  last_name: string;
  street: string;
  zip: string;
  city: string;
  email: string;
}

/** Schritt 1 → 2: rendert die Vorschau mit den eingegebenen Mitarbeiterdaten. */
export async function renderEmploymentPreview(
  token: string,
  fields: EmployeeFields,
): Promise<Result<{ html: string }>> {
  const row = await loadByToken(token);
  if (!row) return { error: "Vertrag nicht gefunden." };
  const merged: EmploymentContractRow = {
    ...row,
    employee_first_name: fields.first_name || row.employee_first_name,
    employee_last_name: fields.last_name || row.employee_last_name,
    employee_street: fields.street || row.employee_street,
    employee_zip: fields.zip || row.employee_zip,
    employee_city: fields.city || row.employee_city,
    employee_email: fields.email || row.employee_email,
  };
  const html = renderEmploymentContractHtml(buildEmploymentRenderInput(merged, { mode: "view" }));
  return { success: true, html };
}

export interface SignPayload extends EmployeeFields {
  signature_data_url: string;
  accept_contract: boolean;
  accept_privacy: boolean;
  confirm_data_correct: boolean;
  werkstudent_status?: boolean;
}

export async function submitEmploymentSignature(token: string, payload: SignPayload): Promise<Result> {
  const row = await loadByToken(token);
  if (!row) return { error: "Vertrag nicht gefunden." };
  if (row.status === "signed") return { error: "Vertrag wurde bereits unterschrieben." };
  if (row.status === "cancelled") return { error: "Vertrag ist nicht mehr gültig." };
  if (isExpired(row)) return { error: "Der Link ist abgelaufen." };
  if (!payload.first_name.trim() || !payload.last_name.trim()) return { error: "Bitte Vor- und Nachname angeben." };
  if (!payload.accept_contract || !payload.accept_privacy || !payload.confirm_data_correct) {
    return { error: "Bitte alle Bestätigungen akzeptieren." };
  }
  if (row.variant === "werkstudent" && !payload.werkstudent_status) {
    return { error: "Bitte die Werkstudenten-/Immatrikulationsbestätigung akzeptieren." };
  }

  const db = createServiceClient();

  // Signatur speichern.
  const up = await uploadEmploymentSignaturePng(row.id, payload.signature_data_url);
  if ("error" in up) return { error: up.error };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const ua = h.get("user-agent") ?? null;
  const signedAt = new Date().toISOString();

  // Atomarer Status-Übergang (Doppelklick-Schutz).
  const { data: upd, error: updErr } = await db
    .from("employment_contracts")
    .update({
      employee_first_name: payload.first_name.trim(),
      employee_last_name: payload.last_name.trim(),
      employee_street: payload.street.trim() || null,
      employee_zip: payload.zip.trim() || null,
      employee_city: payload.city.trim() || null,
      employee_email: payload.email.trim() || null,
      signature_path: up.path,
      status: "signed",
      signed_at: signedAt,
    })
    .eq("id", row.id)
    .in("status", ["sent", "viewed"])
    .select("id")
    .maybeSingle();
  if (updErr) return { error: `Fehler beim Speichern: ${updErr.message}` };
  if (!upd) return { error: "Vertrag konnte nicht unterschrieben werden (Status geändert)." };

  await db.from("employment_contract_events").insert({
    employment_contract_id: row.id,
    event: "signed",
    actor_user_id: null,
    meta: {
      ip,
      user_agent: ua,
      consents: {
        contract: payload.accept_contract,
        privacy: payload.accept_privacy,
        data_correct: payload.confirm_data_correct,
        werkstudent_status: payload.werkstudent_status ?? null,
      },
    },
  });

  // Fragebogen-Datensatz anlegen (pending), falls noch nicht vorhanden.
  await db
    .from("employment_questionnaires")
    .upsert({ employment_contract_id: row.id, status: "pending" }, { onConflict: "employment_contract_id" });

  // Vertrags-PDF (best effort — Signatur ist bereits sicher gespeichert).
  try {
    const providerSignature = await loadProviderSignatureForPdf();
    const signedRow: EmploymentContractRow = {
      ...row,
      employee_first_name: payload.first_name.trim(),
      employee_last_name: payload.last_name.trim(),
      signed_at: signedAt,
    };
    const input = buildEmploymentRenderInput(signedRow, {
      mode: "pdf",
      signature: {
        dataUrl: payload.signature_data_url,
        signedAt: new Date(signedAt).toLocaleDateString("de-DE"),
        signerName: employeeName(signedRow),
      },
      providerSignature,
    });
    const buffer = await renderEmploymentPdf(input);
    const pdfUp = await uploadEmploymentPdf(row.id, buffer);
    if (!("error" in pdfUp)) {
      await db.from("employment_contracts").update({ pdf_path: pdfUp.path }).eq("id", row.id);
    }
  } catch (e) {
    console.error("[submitEmploymentSignature:pdf]", e);
  }

  // Interne Benachrichtigung (best effort).
  try {
    await sendEmploymentSignedNotifyEmail({
      employeeName: employeeName({ employee_first_name: payload.first_name, employee_last_name: payload.last_name }),
      adminUrl: buildEmploymentAdminUrl(row.id),
    });
  } catch (e) {
    console.error("[submitEmploymentSignature:notify]", e);
  }

  return { success: true };
}

export interface QuestionnairePayload {
  data: QuestionnaireData;
  steuer_id: string;
  iban: string;
  bic: string;
  sv_nummer: string;
}

export async function submitQuestionnaire(token: string, payload: QuestionnairePayload): Promise<Result> {
  const row = await loadByToken(token);
  if (!row) return { error: "Vertrag nicht gefunden." };
  if (row.status !== "signed") return { error: "Der Vertrag muss zuerst unterschrieben werden." };

  const iban = (payload.iban ?? "").trim();
  if (iban && !isValidIban(iban)) return { error: "Bitte eine gültige IBAN angeben." };

  const db = createServiceClient();

  const steuerIdEnc = payload.steuer_id?.trim() ? encryptSecret(payload.steuer_id.trim()) : null;
  const ibanEnc = iban ? encryptSecret(normalizeIban(iban)) : null;
  const svEnc = payload.sv_nummer?.trim() ? encryptSecret(payload.sv_nummer.trim()) : null;

  const { error: upErr } = await db
    .from("employment_questionnaires")
    .upsert(
      {
        employment_contract_id: row.id,
        status: "submitted",
        data: payload.data,
        steuer_id_encrypted: steuerIdEnc,
        iban_encrypted: ibanEnc,
        iban_last4: iban ? ibanLast4(iban) : null,
        bic: payload.bic?.trim() || null,
        sv_nummer_encrypted: svEnc,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "employment_contract_id" },
    );
  if (upErr) return { error: `Fehler beim Speichern: ${upErr.message}` };

  await db.from("employment_contract_events").insert({
    employment_contract_id: row.id,
    event: "questionnaire_submitted",
    actor_user_id: null,
    meta: {},
  });

  // Fertig ausgefülltes Personalfragebogen-PDF (best effort).
  try {
    const buffer = await renderQuestionnairePdf({
      firstName: row.employee_first_name ?? "",
      lastName: row.employee_last_name ?? "",
      street: row.employee_street ?? "",
      zip: row.employee_zip ?? "",
      city: row.employee_city ?? "",
      email: row.employee_email ?? "",
      contract: row,
      data: payload.data,
      steuerId: payload.steuer_id?.trim() ?? "",
      iban: iban ? normalizeIban(iban) : "",
      bic: payload.bic?.trim() ?? "",
      svNummer: payload.sv_nummer?.trim() ?? "",
      signedAt: row.signed_at ? new Date(row.signed_at).toLocaleDateString("de-DE") : "",
    });
    const pdfUp = await uploadQuestionnairePdf(row.id, buffer);
    if (!("error" in pdfUp)) {
      await db.from("employment_questionnaires").update({ pdf_path: pdfUp.path }).eq("employment_contract_id", row.id);
    }
  } catch (e) {
    console.error("[submitQuestionnaire:pdf]", e);
  }

  try {
    await sendQuestionnaireSubmittedNotifyEmail({
      employeeName: employeeName(row),
      adminUrl: buildEmploymentAdminUrl(row.id),
    });
  } catch (e) {
    console.error("[submitQuestionnaire:notify]", e);
  }

  return { success: true };
}

export async function getSignedEmploymentPdf(token: string): Promise<Result<{ url: string }>> {
  const row = await loadByToken(token);
  if (!row || row.status !== "signed" || !row.pdf_path) {
    return { error: "PDF ist noch nicht verfügbar." };
  }
  const url = await getContractFileSignedUrl(row.pdf_path, 3600);
  if (!url) return { error: "Download-Link konnte nicht erzeugt werden." };
  return { success: true, url };
}
