// Signatur-Parser: extrahiert aus einem E-Mail-Body Name/Position/Telefon
// einer Person via Claude Haiku. Wird im Mail-Sync genutzt, um Ansprechpartner
// automatisch anzulegen.

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { extractDomain, isFreemailDomain } from "./thread";

const MODEL = "claude-haiku-4-5-20251001";

// Adressen, die niemals als Person interpretiert werden sollen.
const NEVER_PERSON_LOCAL = /^(noreply|no-reply|do-not-reply|donotreply|postmaster|mailer-daemon|bounces?|notifications?|info|kontakt|sales|support|service|help|hello|newsletter|news|press|presse|office|buero|admin|hr|hi)$/i;

export interface ExtractedSignature {
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  phone: string | null;
}

function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^>/.test(t)) break;
    if (/^Am .+ schrieb .+:$/.test(t)) break;
    if (/^On .+ wrote:$/.test(t)) break;
    if (/^Von:\s/i.test(t) || /^From:\s/i.test(t)) break;
    if (/^-{2,}\s*Ursprüngliche Nachricht\s*-{2,}/i.test(t)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function tailBlock(text: string, maxLines = 20): string {
  const cleaned = text.replace(/\r/g, "");
  const lines = cleaned.split("\n").filter((l) => l.length < 200);
  return lines.slice(-maxLines).join("\n").trim();
}

function isLikelyPersonAddress(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (!local) return false;
  return !NEVER_PERSON_LOCAL.test(local);
}

export function shouldAttemptSignatureExtraction(args: {
  fromEmail: string | null;
  ownerEmail: string | null;
}): boolean {
  const { fromEmail, ownerEmail } = args;
  if (!fromEmail) return false;
  if (ownerEmail && fromEmail.toLowerCase() === ownerEmail.toLowerCase()) return false;
  if (!isLikelyPersonAddress(fromEmail)) return false;
  const dom = extractDomain(fromEmail);
  if (isFreemailDomain(dom)) {
    // Bei Freemail-Adressen ist die Domain kein Hinweis auf Firmenzugehörigkeit,
    // aber die Signatur kann trotzdem zur Person passen — wir erlauben es,
    // weil zu diesem Zeitpunkt der Lead bereits matcht (sonst kein Auto-Create).
  }
  return true;
}

/**
 * Extrahiert Personendaten aus einem Mail-Body. Gibt null zurück, wenn
 * Claude keinen Treffer findet oder die Antwort nicht parsebar ist.
 */
export async function extractSignatureWithClaude(args: {
  body: string;
  fromName: string | null;
  fromEmail: string;
}): Promise<ExtractedSignature | null> {
  const cleaned = stripQuotedReply(args.body);
  const tail = tailBlock(cleaned);
  if (tail.length < 10) return null;

  const client = new Anthropic();
  const prompt = `Du bekommst das Ende einer E-Mail. Extrahiere die Daten der Person, die unterschrieben hat (Signatur). Wenn keine Signatur erkennbar ist oder die Mail offensichtlich von einem automatischen System stammt, antworte mit \`null\`.

Antworte ausschließlich mit gültigem JSON in genau diesem Format:
{"first_name": string|null, "last_name": string|null, "role": string|null, "phone": string|null}

Regeln:
- Telefonnummer im E.164-nahen Format (+49..., +43..., +41...). Mobile bevorzugen, sonst Festnetz.
- Position/Rolle kurz halten (z.B. "Geschäftsführer", "Marketing Leitung").
- Vornamen und Nachnamen trennen. Bei Doppelnamen: ganzer Vorname bzw. Nachname.
- Keine Disclaimer, Firmennamen oder Adressen ausgeben.
- Wenn unklar: das jeweilige Feld auf null setzen.

Absender-Header (zur Hilfe): from_email="${args.fromEmail}", from_name="${args.fromName ?? ""}"

E-Mail-Ende:
"""
${tail}
"""`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
    if (raw === "null" || raw === "") return null;
    const parsed = JSON.parse(raw) as ExtractedSignature;
    if (!parsed || typeof parsed !== "object") return null;
    const empty = !parsed.first_name && !parsed.last_name && !parsed.role && !parsed.phone;
    if (empty) return null;
    return {
      first_name: parsed.first_name?.toString().trim() || null,
      last_name: parsed.last_name?.toString().trim() || null,
      role: parsed.role?.toString().trim() || null,
      phone: parsed.phone?.toString().trim() || null,
    };
  } catch (e) {
    console.error("[signature:extract]", e);
    return null;
  }
}

/**
 * Legt aus extrahierten Daten einen customer_contact an — idempotent über
 * (lead_id, email). Bestehende Kontakte werden NICHT überschrieben.
 */
export async function upsertContactFromSignature(args: {
  leadId: string;
  email: string;
  fromName: string | null;
  extracted: ExtractedSignature;
}): Promise<{ created: boolean }> {
  const db = createServiceClient();
  const email = args.email.toLowerCase();

  const { data: existing } = await db
    .from("customer_contacts")
    .select("id")
    .eq("lead_id", args.leadId)
    .eq("email", email)
    .maybeSingle();
  if (existing) return { created: false };

  // Fallback: Falls Claude keinen Namen liefert, aus from_name oder Local-Part bauen.
  let firstName = args.extracted.first_name;
  let lastName = args.extracted.last_name;
  if (!firstName && !lastName && args.fromName) {
    const parts = args.fromName.trim().split(/\s+/);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    } else if (parts.length === 1) {
      firstName = parts[0];
    }
  }
  if (!firstName && !lastName) {
    const local = email.split("@")[0] ?? "";
    firstName = local;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await db.from("customer_contacts").insert({
    lead_id: args.leadId,
    first_name: firstName || email,
    last_name: lastName,
    salutation: "sie",
    role: args.extracted.role,
    email,
    phone: args.extracted.phone,
    is_primary: false,
    notes: `[auto:signature ${today}] Automatisch aus E-Mail-Signatur erkannt.`,
  });
  if (error) {
    console.error("[signature:upsertContact]", error);
    return { created: false };
  }
  return { created: true };
}
