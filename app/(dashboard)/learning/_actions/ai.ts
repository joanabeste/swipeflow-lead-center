"use server";

import Anthropic from "@anthropic-ai/sdk";
import { checkLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningLessonType } from "@/lib/types";

const MODEL = "claude-sonnet-4-6";

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
}

async function logUsage(userId: string, feature: string, promptChars: number, resultChars: number) {
  const db = createServiceClient();
  await db.from("learning_ai_usage").insert({
    user_id: userId,
    feature,
    prompt_chars: promptChars,
    result_chars: resultChars,
    model: MODEL,
  });
}

// ─── Outline-Generator ────────────────────────────────────────────

export interface OutlineLesson {
  title: string;
  lesson_type: LearningLessonType;
  summary: string;
}

export interface OutlineModule {
  title: string;
  description: string;
  lessons: OutlineLesson[];
}

export interface CourseOutline {
  modules: OutlineModule[];
}

export async function generateCourseOutline(input: {
  prompt: string;
  moduleCount?: number;
  lessonsPerModule?: number;
}): Promise<{ outline: CourseOutline } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY nicht gesetzt." };
  if (!input.prompt.trim()) return { error: "Bitte beschreibe, worum es im Kurs gehen soll." };

  const moduleCount = Math.min(8, Math.max(2, input.moduleCount ?? 4));
  const lessonsPerModule = Math.min(8, Math.max(2, input.lessonsPerModule ?? 3));

  const system = `Du bist ein Instructional Designer. Du strukturierst Onboarding- und Schulungs-Kurse fuer interne Mitarbeitende.
Antworte AUSSCHLIESSLICH mit gueltigem JSON in genau diesem Schema:
{
  "modules": [
    {
      "title": "string",
      "description": "kurzer 1-Satz-Beschreibungstext",
      "lessons": [
        {
          "title": "string",
          "lesson_type": "video" | "text" | "file" | "mixed",
          "summary": "kurze 1-Satz-Vorschau"
        }
      ]
    }
  ]
}
Schreibe alles auf Deutsch (Du-Form). Keine Erklaerungen, kein Markdown, NUR JSON.`;

  const user = `Erstelle eine Kurs-Outline mit ${moduleCount} Modulen, je ${lessonsPerModule} Lektionen.
Verteile die Lesson-Types sinnvoll: einfuehrende Lektionen oft 'video', Konzept-Vertiefung 'text', Praxis-Material 'file', kombinierte Lektionen 'mixed'.

Thema/Beschreibung: ${input.prompt}`;

  try {
    const client = getClient();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    // Defensive JSON-Extraction: falls Claude doch mit ```json wrappt
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    let parsed: CourseOutline;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { error: "AI-Antwort war kein gueltiges JSON." };
    }
    if (!parsed.modules || !Array.isArray(parsed.modules)) {
      return { error: "AI-Antwort hat falsche Struktur." };
    }
    await logUsage(ctx.user.id, "outline", input.prompt.length, text.length);
    return { outline: parsed };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI-Fehler." };
  }
}

/** Outline auf bestehenden Kurs anwenden — Bulk-Insert Module + Lektionen. */
export async function applyOutlineToCourse(input: {
  courseId: string;
  outline: CourseOutline;
}): Promise<{ moduleCount: number; lessonCount: number } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  const db = createServiceClient();

  // Naechster sort_order ans Ende anfuegen
  const { data: maxMod } = await db
    .from("learning_modules")
    .select("sort_order")
    .eq("course_id", input.courseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let modOrder = (maxMod?.sort_order ?? -1) + 1;

  let moduleCount = 0;
  let lessonCount = 0;
  for (const m of input.outline.modules) {
    const { data: insertedMod, error: modErr } = await db
      .from("learning_modules")
      .insert({
        course_id: input.courseId,
        title: m.title,
        description: m.description ?? null,
        sort_order: modOrder++,
      })
      .select()
      .single();
    if (modErr || !insertedMod) continue;
    moduleCount++;

    let lessonOrder = 0;
    for (const l of m.lessons) {
      const { error: lErr } = await db.from("learning_lessons").insert({
        module_id: insertedMod.id,
        title: l.title,
        lesson_type: ["video", "text", "file", "mixed"].includes(l.lesson_type) ? l.lesson_type : "mixed",
        summary: l.summary ?? null,
        sort_order: lessonOrder++,
        created_by: ctx.user.id,
      });
      if (!lErr) lessonCount++;
    }
  }

  return { moduleCount, lessonCount };
}

// ─── Content-Rewrite ──────────────────────────────────────────────

export type RewriteMode = "shorten" | "formal" | "bullets" | "simpler" | "custom";

export async function rewriteText(input: {
  text: string;
  mode: RewriteMode;
  instruction?: string;
}): Promise<{ text: string } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY nicht gesetzt." };
  if (!input.text.trim()) return { error: "Kein Text uebergeben." };

  const promptByMode: Record<RewriteMode, string> = {
    shorten: "Kuerze den folgenden Text deutlich, ohne den Sinn zu verlieren.",
    formal: "Formuliere den folgenden Text in einem foermlich-professionellen Ton um.",
    bullets: "Wandle den folgenden Text in eine klar gegliederte Bullet-Liste um. Antworte mit HTML <ul><li>-Tags.",
    simpler: "Erklaere den folgenden Text einfacher, sodass Anfaenger ihn verstehen.",
    custom: input.instruction ?? "Schreibe den folgenden Text um.",
  };

  const system = `Du bist ein hilfreicher Content-Editor fuer interne Schulungs-Lektionen.
Antworte AUSSCHLIESSLICH mit dem umgeschriebenen Text in HTML (passend zu TipTap),
ohne Erklaerung oder Codeblock-Marker. Behalte ueberschriften, Listen, Fett/Kursiv
in HTML-Tags. Schreibe auf Deutsch (Du-Form).`;

  const user = `${promptByMode[input.mode]}\n\nText:\n${input.text}`;

  try {
    const client = getClient();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/```\s*$/, "");
    await logUsage(ctx.user.id, "rewrite", input.text.length, text.length);
    return { text };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI-Fehler." };
  }
}
