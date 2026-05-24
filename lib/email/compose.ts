// KI-gestützter Mail-Draft-Generator. Sammelt Kontext (Kunde, Projekt,
// Thread-Verlauf, Stil aus Sent-Mails) und erzeugt einen Entwurf via Claude
// Sonnet. Die Signatur wird hier bewusst NICHT generiert — sie wird beim
// tatsächlichen Versand in mail-actions automatisch angehängt.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

const MODEL = "claude-sonnet-4-6";
const STYLE_REFERENCE_LIMIT = 5;

export type ComposeTone = "formal" | "freundlich" | "kurz";

export interface ComposeInput {
  userId: string;
  fromEmail: string;
  leadId: string;
  threadId?: string | null;
  recipient?: string | null;
  subject?: string | null;
  intent?: string | null;
  tone?: ComposeTone | null;
}

export interface ComposeResult {
  subject: string;
  body: string;
}

function stripBody(text: string): string {
  // Quote + Signatur grob abschneiden, damit das Modell nur den eigentlichen
  // Mail-Inhalt als Stil-Referenz bekommt.
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith(">")) { end = i; break; }
    if (/^Am .+ schrieb .+:$/.test(t) || /^On .+ wrote:$/.test(t)) { end = i; break; }
    if (t === "-- " || t === "--") { end = i; break; }
  }
  return lines.slice(0, end).join("\n").trim().slice(0, 1500);
}

export async function generateMailDraft(input: ComposeInput): Promise<{ ok: true; draft: ComposeResult } | { ok: false; error: string }> {
  const db = createServiceClient();

  // 1) Kunde + aktives Projekt laden.
  const { data: lead } = await db
    .from("leads")
    .select("id, company_name, industry, city, description")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Kunde nicht gefunden." };

  let projectContext = "";
  if (input.threadId) {
    const { data: t } = await db
      .from("email_threads")
      .select("project_id, projects(name, vertical, status, notes)")
      .eq("id", input.threadId)
      .maybeSingle();
    const proj = (t?.projects as unknown as { name: string; vertical: string | null; status: string; notes: string | null } | null) ?? null;
    if (proj) {
      projectContext = `Projekt: "${proj.name}" (Bereich ${proj.vertical ?? "—"}, Status ${proj.status})${proj.notes ? `\nNotizen: ${proj.notes.slice(0, 300)}` : ""}`;
    }
  }

  // 2) Thread-Kontext (letzte 3 Mails) — nur bei Reply.
  let threadBlock = "";
  if (input.threadId) {
    const { data: msgs } = await db
      .from("email_thread_messages")
      .select("direction, from_email, from_name, subject, body_text, received_at")
      .eq("thread_id", input.threadId)
      .order("received_at", { ascending: false })
      .limit(3);
    const ordered = (msgs ?? []).reverse();
    if (ordered.length > 0) {
      threadBlock = "\n\nBisheriger Thread-Verlauf (chronologisch, neuste zuletzt):\n" + ordered
        .map((m, i) => {
          const who = m.direction === "out" ? "Du" : (m.from_name || m.from_email || "Kunde");
          return `--- Mail ${i + 1} (${who}) ---\nBetreff: ${m.subject ?? ""}\n${stripBody((m.body_text as string | null) ?? "")}`;
        })
        .join("\n\n");
    }
  }

  // 3) Stil-Referenz: letzte 5 eigene Sent-Mails.
  const { data: sentMsgs } = await db
    .from("email_thread_messages")
    .select("body_text")
    .eq("user_id", input.userId)
    .eq("direction", "out")
    .not("body_text", "is", null)
    .order("received_at", { ascending: false })
    .limit(STYLE_REFERENCE_LIMIT);
  const styleSamples = (sentMsgs ?? [])
    .map((m) => stripBody((m.body_text as string | null) ?? ""))
    .filter((b) => b.length > 30);
  const styleBlock = styleSamples.length
    ? "\n\nStil-Referenz (letzte eigene Mails dieses Users — Tonalität & Wortwahl übernehmen, NICHT Inhalt kopieren):\n" +
      styleSamples.map((b, i) => `--- Beispiel ${i + 1} ---\n${b}`).join("\n\n")
    : "";

  const tone = input.tone ?? "freundlich";
  const toneHint = tone === "formal"
    ? "Stil: formal, sachlich, Sie-Form (außer Stil-Referenz zeigt das Du)."
    : tone === "kurz"
    ? "Stil: sehr kurz, 3–4 Sätze maximum."
    : "Stil: freundlich, prägnant, an die Stil-Referenz angelehnt.";

  const intentHint = input.intent?.trim() ? `\nZweck der Mail: ${input.intent.trim()}` : "";
  const recipientHint = input.recipient ? `\nEmpfänger: ${input.recipient}` : "";
  const subjectHint = input.subject?.trim()
    ? `\nBetreff (vorgegeben, übernehmen wenn passend): ${input.subject.trim()}`
    : "";

  const prompt = `Du formulierst einen E-Mail-Entwurf für eine Agentur. Berücksichtige Kontext, Tonalität und Stil-Referenz.

Kunde: ${lead.company_name}${lead.industry ? ` (${lead.industry})` : ""}${lead.city ? `, ${lead.city}` : ""}
${projectContext}${recipientHint}${subjectHint}${intentHint}
${toneHint}
${threadBlock}${styleBlock}

Aufgabe: Schreibe einen passenden Mail-Body (nur den Body, ohne Anrede-Floskeln am Ende wie "Mit freundlichen Grüßen" und ohne Signatur — die wird automatisch angehängt). Wenn ein Betreff vorgegeben ist, übernimm ihn; sonst schlage einen kurzen passenden vor.

Antworte ausschließlich mit gültigem JSON in genau diesem Format:
{"subject": "<Betreff>", "body": "<Mail-Body mit \\n als Zeilenumbrüchen>"}

Regeln:
- Body in der Sprache, die in der Stil-Referenz / im bisherigen Thread benutzt wurde (sonst Deutsch).
- Keine Markdown-Auszeichnungen.
- Keine generischen Floskeln, keine "Lorem ipsum"-artigen Platzhalter.
- Wenn es eine Antwort auf den Thread ist, beziehe dich konkret auf die letzte Mail.`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { ok: false, error: "Keine Antwort vom Modell." };
    const raw = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(raw) as { subject?: string; body?: string };
    const subject = (parsed.subject ?? input.subject ?? "").toString().trim();
    const body = (parsed.body ?? "").toString().trim();
    if (!body) return { ok: false, error: "Modell hat keinen Body geliefert." };
    return { ok: true, draft: { subject, body } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generateMailDraft]", e);
    return { ok: false, error: msg };
  }
}
