// Klassifiziert einen E-Mail-Thread inhaltlich gegen die Projekte eines Leads
// und vergibt mit hoher Konfidenz automatisch eine Projekt-Zuordnung.
// Bei niedriger Konfidenz wird nur ein Vorschlag gespeichert (auto_project_id),
// den der User in der UI annehmen oder verwerfen kann.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";

const MODEL = "claude-haiku-4-5-20251001";
const AUTO_PROMOTE_THRESHOLD = 0.8;

export interface ClassifierResult {
  projectId: string | null;
  score: number;
  topicLabel: string;
  reason: string;
  promoted: boolean;
}

interface ProjectCandidate {
  id: string;
  name: string;
  vertical: string | null;
  status: string;
}

interface FewShotExample {
  subject: string;
  bodySnippet: string;
  projectId: string | null;
  projectName: string | null;
  rejectedFor: string | null; // Projekt-Name, das verworfen wurde
}

async function loadFewShotExamples(args: { leadId: string; excludeThreadId: string }): Promise<FewShotExample[]> {
  const db = createServiceClient();
  // 5 Threads desselben Leads, die bereits eine Projekt-Zuordnung haben — als Positive.
  const { data: positive } = await db
    .from("email_threads")
    .select("id, subject_normalized, project_id, projects!inner(id, name)")
    .eq("lead_id", args.leadId)
    .neq("id", args.excludeThreadId)
    .not("project_id", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(5);

  // 3 verworfene Vorschläge — als Negative.
  const { data: negative } = await db
    .from("email_threads")
    .select("id, subject_normalized, auto_project_id, projects!email_threads_auto_project_id_fkey(id, name)")
    .eq("lead_id", args.leadId)
    .neq("id", args.excludeThreadId)
    .eq("auto_project_rejected", true)
    .order("last_message_at", { ascending: false })
    .limit(3);

  const all = [...(positive ?? []), ...(negative ?? [])];
  const threadIds = all.map((t) => t.id as string);
  if (threadIds.length === 0) return [];

  // Erstes Body-Snippet je Thread für Stil-/Inhaltsreferenz.
  const { data: msgs } = await db
    .from("email_thread_messages")
    .select("thread_id, body_text")
    .in("thread_id", threadIds)
    .order("received_at", { ascending: true });

  const firstBody = new Map<string, string>();
  for (const m of msgs ?? []) {
    const tid = m.thread_id as string;
    if (!firstBody.has(tid)) {
      const body = ((m.body_text as string | null) ?? "").slice(0, 400);
      firstBody.set(tid, body);
    }
  }

  const examples: FewShotExample[] = [];
  for (const t of positive ?? []) {
    const proj = (t.projects as unknown as { id: string; name: string } | null) ?? null;
    examples.push({
      subject: ((t.subject_normalized as string | null) ?? "(ohne Betreff)").slice(0, 200),
      bodySnippet: firstBody.get(t.id as string) ?? "",
      projectId: (t.project_id as string | null) ?? null,
      projectName: proj?.name ?? null,
      rejectedFor: null,
    });
  }
  for (const t of negative ?? []) {
    const proj = (t.projects as unknown as { id: string; name: string } | null) ?? null;
    examples.push({
      subject: ((t.subject_normalized as string | null) ?? "(ohne Betreff)").slice(0, 200),
      bodySnippet: firstBody.get(t.id as string) ?? "",
      projectId: null,
      projectName: null,
      rejectedFor: proj?.name ?? null,
    });
  }
  return examples;
}

/**
 * Best-effort Klassifizierung. Idempotent gegenüber dem letzten last_message_at:
 * wenn der Thread schon klassifiziert wurde und keine neuen Nachrichten dazu kamen,
 * passiert nichts.
 */
export async function classifyThreadForProject(args: {
  threadId: string;
  leadId: string;
}): Promise<ClassifierResult | { error: string } | { skipped: true }> {
  const db = createServiceClient();

  const { data: thread, error: threadErr } = await db
    .from("email_threads")
    .select("id, subject_normalized, project_id, auto_project_id, auto_project_score, auto_project_rejected, last_message_at")
    .eq("id", args.threadId)
    .maybeSingle();
  if (threadErr || !thread) return { error: threadErr?.message ?? "Thread nicht gefunden." };

  // Wenn Thread schon manuell zugeordnet ist UND nicht erneut bewertet werden muss → skip.
  // Wir bewerten weiterhin, falls auto_project_score noch null ist (für topic_cluster_key).
  if (thread.project_id && thread.auto_project_score !== null) {
    return { skipped: true };
  }
  if (thread.auto_project_rejected && thread.auto_project_score !== null) {
    return { skipped: true };
  }

  const { data: projects } = await db
    .from("projects")
    .select("id, name, vertical, status")
    .eq("lead_id", args.leadId)
    .in("status", ["onboarding", "active", "paused"])
    .order("status", { ascending: true });
  const candidates = (projects ?? []) as ProjectCandidate[];
  if (candidates.length === 0) {
    // Kein Projekt zum Zuordnen — nur topic_cluster_key auf Subject zurückfallen.
    const fallback = (thread.subject_normalized as string | null) ?? "";
    await db
      .from("email_threads")
      .update({
        auto_project_id: null,
        auto_project_score: 0,
        auto_project_reason: "Kein offenes Projekt verfügbar.",
        topic_cluster_key: fallback || null,
      })
      .eq("id", args.threadId);
    return { projectId: null, score: 0, topicLabel: fallback, reason: "Kein offenes Projekt verfügbar.", promoted: false };
  }

  // Erstmail (Thread-Start) + letzte 3 — gibt der KI sowohl Kontext der Konversation als auch des Themas.
  const [{ data: first }, { data: tail }] = await Promise.all([
    db
      .from("email_thread_messages")
      .select("subject, body_text, from_email, received_at")
      .eq("thread_id", args.threadId)
      .order("received_at", { ascending: true })
      .limit(1),
    db
      .from("email_thread_messages")
      .select("subject, body_text, from_email, received_at")
      .eq("thread_id", args.threadId)
      .order("received_at", { ascending: false })
      .limit(3),
  ]);
  const reversedTail = (tail ?? []).reverse();
  // Erstmail nur dazu nehmen, wenn nicht schon in tail.
  const firstMsg = (first ?? [])[0];
  const messageSource =
    firstMsg && !reversedTail.some((m) => m.received_at === firstMsg.received_at)
      ? [firstMsg, ...reversedTail]
      : reversedTail;
  if (messageSource.length === 0) return { error: "Thread hat keine Nachrichten." };

  // Few-Shot Beispiele aus bestätigten Zuordnungen des Leads.
  const examples = await loadFewShotExamples({ leadId: args.leadId, excludeThreadId: args.threadId });

  const prompt = buildPrompt({
    subject: (thread.subject_normalized as string | null) ?? "",
    messages: messageSource.map((m) => ({
      from: (m.from_email as string | null) ?? "",
      subject: (m.subject as string | null) ?? "",
      body: ((m.body_text as string | null) ?? "").slice(0, 2000),
    })),
    candidates,
    examples,
  });

  const client = new Anthropic();
  let parsed: ClassifierLLMOutput | null = null;
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (block && block.type === "text") {
      const raw = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(raw) as ClassifierLLMOutput;
    }
  } catch (e) {
    console.error("[classifier] LLM error:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (!parsed) return { error: "Keine LLM-Antwort." };

  // Validierung: projectId muss zu den candidates passen
  let projectId: string | null = parsed.project_id ?? null;
  if (projectId && !candidates.some((c) => c.id === projectId)) {
    projectId = null;
  }
  const score = clamp01(parsed.confidence ?? 0);
  const topicLabel = (parsed.topic_label ?? "").toString().slice(0, 120) || null;
  const reason = (parsed.reason ?? "").toString().slice(0, 500) || null;

  const promote = projectId !== null && score >= AUTO_PROMOTE_THRESHOLD && !thread.project_id && !thread.auto_project_rejected;

  const update: Record<string, unknown> = {
    auto_project_id: projectId,
    auto_project_score: score,
    auto_project_reason: reason,
    topic_cluster_key: topicLabel,
  };
  if (promote) update.project_id = projectId;

  const { error: updateErr } = await db.from("email_threads").update(update).eq("id", args.threadId);
  if (updateErr) return { error: updateErr.message };

  return {
    projectId,
    score,
    topicLabel: topicLabel ?? "",
    reason: reason ?? "",
    promoted: promote,
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

interface ClassifierLLMOutput {
  project_id: string | null;
  confidence: number;
  topic_label: string;
  reason: string;
}

function buildPrompt(args: {
  subject: string;
  messages: { from: string; subject: string; body: string }[];
  candidates: ProjectCandidate[];
  examples: FewShotExample[];
}): string {
  const candidateList = args.candidates
    .map((c) => `- id: "${c.id}"\n  name: "${c.name}"\n  bereich: ${c.vertical ?? "—"}\n  status: ${c.status}`)
    .join("\n");
  const messageBlock = args.messages
    .map((m, i) => `--- Nachricht ${i + 1} (von ${m.from}) ---\nBetreff: ${m.subject}\n${m.body}`)
    .join("\n\n");

  let examplesBlock = "";
  const positive = args.examples.filter((e) => e.projectName);
  const negative = args.examples.filter((e) => e.rejectedFor);
  if (positive.length > 0 || negative.length > 0) {
    const posLines = positive
      .map(
        (e, i) =>
          `Positiv ${i + 1}: Betreff "${e.subject}" → Projekt "${e.projectName}"\n  Auszug: ${e.bodySnippet.slice(0, 200)}`,
      )
      .join("\n\n");
    const negLines = negative
      .map(
        (e, i) =>
          `Negativ ${i + 1}: Betreff "${e.subject}" → wurde NICHT "${e.rejectedFor}" zugeordnet\n  Auszug: ${e.bodySnippet.slice(0, 200)}`,
      )
      .join("\n\n");
    examplesBlock = `\n\nFrühere Entscheidungen dieses Kunden (als Referenz, nicht direkt kopieren):\n${[posLines, negLines].filter(Boolean).join("\n\n")}\n`;
  }

  return `Du bist ein E-Mail-Klassifizierer für ein Agentur-CRM. Ein Kunde hat mehrere parallel laufende Projekte (z.B. Recruiting-Kampagnen, Webdesign). Ordne den folgenden E-Mail-Thread genau einem dieser Projekte zu — aber nur, wenn der Inhalt es klar hergibt.

Verfügbare Projekte dieses Kunden:
${candidateList}
${examplesBlock}
E-Mail-Thread:
Thread-Betreff: ${args.subject}

${messageBlock}

Antworte ausschließlich mit gültigem JSON in genau diesem Format:
{"project_id": "<id-aus-liste-oder-null>", "confidence": <0..1>, "topic_label": "<kurze 2-4-Wort-Beschreibung des Themas>", "reason": "<1 Satz Begründung>"}

Regeln:
- confidence ≥ 0.8 nur vergeben, wenn der Inhalt explizit zum Projekt passt (Name, Branche oder klare Kontext-Bezüge).
- Wenn der Inhalt zu mehreren Projekten passen könnte oder zu keinem: project_id = null und confidence ≤ 0.5.
- topic_label ist ein kurzes deutsches Schlagwort (z.B. "Recruiting Azubi", "Website-Update", "Rechnung"). Niemals leer.
- reason in einem Satz auf Deutsch, sachlich.
- Berücksichtige die früheren Entscheidungen: ähnliche Themen wie in Positiv-Beispielen sollten dasselbe Projekt erhalten; ähnliche wie in Negativ-Beispielen niemals das dort verworfene Projekt.`;
}
