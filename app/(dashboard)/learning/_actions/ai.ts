"use server";

import Anthropic from "@anthropic-ai/sdk";
import { checkLearningEditor } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { LearningBlock, LearningLessonType } from "@/lib/types";

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

/** Outline auf bestehenden Kurs anwenden — Bulk-Insert Module + Lektionen.
 *  Wenn `withContent: true`, generiert zusaetzlich pro Lesson Text-Inhalte via KI. */
export async function applyOutlineToCourse(input: {
  courseId: string;
  outline: CourseOutline;
  withContent?: boolean;
}): Promise<
  | { moduleCount: number; lessonCount: number; contentGenerated: number }
  | { error: string }
> {
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

  // Kurs-Stammdaten fuer eventuelles Content-Generieren laden
  let courseCtx: { title: string; summary: string | null; learning_objectives: string[] } | null = null;
  if (input.withContent) {
    const { data: c } = await db
      .from("learning_courses")
      .select("title, summary, learning_objectives")
      .eq("id", input.courseId)
      .maybeSingle();
    if (c) {
      courseCtx = {
        title: c.title as string,
        summary: c.summary as string | null,
        learning_objectives: (c.learning_objectives as string[] | null) ?? [],
      };
    }
  }

  let moduleCount = 0;
  let lessonCount = 0;
  let contentGenerated = 0;

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
    // Inserts erst sammeln, danach optional Content parallel generieren
    const insertedLessons: Array<{ id: string; title: string; summary: string | null }> = [];

    for (const l of m.lessons) {
      const { data: insertedLesson, error: lErr } = await db
        .from("learning_lessons")
        .insert({
          module_id: insertedMod.id,
          title: l.title,
          lesson_type: ["video", "text", "file", "mixed"].includes(l.lesson_type) ? l.lesson_type : "mixed",
          summary: l.summary ?? null,
          sort_order: lessonOrder++,
          created_by: ctx.user.id,
        })
        .select("id, title, summary")
        .single();
      if (lErr || !insertedLesson) continue;
      lessonCount++;
      insertedLessons.push({
        id: insertedLesson.id as string,
        title: insertedLesson.title as string,
        summary: insertedLesson.summary as string | null,
      });
    }

    // Optional: Content pro Lesson in dieser Modul-Batch generieren (max 4 parallel)
    if (input.withContent && courseCtx) {
      const moduleCtx = { title: m.title, description: m.description ?? null };
      const batches: Array<typeof insertedLessons> = [];
      for (let i = 0; i < insertedLessons.length; i += 4) {
        batches.push(insertedLessons.slice(i, i + 4));
      }
      for (const batch of batches) {
        const results = await Promise.all(
          batch.map(async (lesson) => {
            const lessonCtx: LessonContext = {
              course: courseCtx!,
              module: moduleCtx,
              lesson: { title: lesson.title, summary: lesson.summary },
            };
            return { id: lesson.id, blocks: await generateBlocksFor(lessonCtx, "medium", ctx.user.id) };
          }),
        );
        for (const r of results) {
          if (!r.blocks || r.blocks.length === 0) continue;
          const { error: updErr } = await db
            .from("learning_lessons")
            .update({ blocks: r.blocks })
            .eq("id", r.id);
          if (!updErr) contentGenerated++;
        }
      }
    }
  }

  return { moduleCount, lessonCount, contentGenerated };
}

/** Interner Helper: nutzt den gleichen Prompt wie generateLessonContent,
 *  aber direkt mit vorhandenem Kontext (vermeidet zusaetzlichen DB-Roundtrip). */
async function generateBlocksFor(
  ctx: LessonContext,
  length: LessonContentLength,
  userId: string,
): Promise<LearningBlock[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const user = buildContentUserPrompt(ctx, length);
  try {
    const client = getClient();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: LENGTH_TOKENS[length],
      system: CONTENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    await logUsage(userId, "content", user.length, text.length);
    return validateAiBlocks(parsed);
  } catch {
    return null;
  }
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

// ─── Lesson-Content-Generator ─────────────────────────────────────

export type LessonContentLength = "short" | "medium" | "long";

const LENGTH_TOKENS: Record<LessonContentLength, number> = {
  short: 1024,
  medium: 2048,
  long: 4096,
};

const LENGTH_WORDS: Record<LessonContentLength, string> = {
  short: "ca. 300 Woerter",
  medium: "ca. 600 Woerter",
  long: "ca. 1000 Woerter",
};

/** Validiert + bereinigt von AI gelieferte Bloecke: nur text + button. */
function validateAiBlocks(input: unknown): LearningBlock[] {
  if (!input || typeof input !== "object") return [];
  const wrap = input as { blocks?: unknown };
  const raw = Array.isArray(wrap.blocks) ? wrap.blocks : [];
  const out: LearningBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.html === "string" && obj.html.trim()) {
      out.push({ id: crypto.randomUUID(), type: "text", html: obj.html });
    } else if (
      obj.type === "button" &&
      typeof obj.label === "string" &&
      typeof obj.url === "string" &&
      obj.label.trim() &&
      obj.url.trim()
    ) {
      out.push({ id: crypto.randomUUID(), type: "button", label: obj.label, url: obj.url });
    }
  }
  return out;
}

interface LessonContext {
  course: { title: string; summary: string | null; learning_objectives: string[] };
  module: { title: string; description: string | null };
  lesson: { title: string; summary: string | null };
}

async function loadLessonContext(lessonId: string): Promise<LessonContext | null> {
  const db = createServiceClient();
  const { data: lessonRow } = await db
    .from("learning_lessons")
    .select("title, summary, module_id, learning_modules!inner(title, description, course_id, learning_courses!inner(title, summary, learning_objectives))")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lessonRow) return null;
  type Row = {
    title: string;
    summary: string | null;
    learning_modules: {
      title: string;
      description: string | null;
      learning_courses: {
        title: string;
        summary: string | null;
        learning_objectives: string[] | null;
      };
    };
  };
  const r = lessonRow as unknown as Row;
  return {
    course: {
      title: r.learning_modules.learning_courses.title,
      summary: r.learning_modules.learning_courses.summary,
      learning_objectives: r.learning_modules.learning_courses.learning_objectives ?? [],
    },
    module: { title: r.learning_modules.title, description: r.learning_modules.description },
    lesson: { title: r.title, summary: r.summary },
  };
}

const CONTENT_SYSTEM_PROMPT = `Du bist Instructional Designer fuer interne Mitarbeiter-Schulungen.
Schreibe Schulungs-Inhalte auf Deutsch in Du-Form (informell, klar, praxisnah).

Antworte AUSSCHLIESSLICH mit gueltigem JSON nach genau diesem Schema:
{
  "blocks": [
    { "type": "text", "html": "HTML mit <p>, <h2>, <h3>, <strong>, <em>, <ul>/<ol><li>, <a href>" },
    { "type": "button", "label": "string", "url": "https://..." }
  ]
}

Erlaubte Block-Typen: NUR "text" und "button".
KEINE Bilder, Videos oder Dateien — die werden spaeter manuell hinzugefuegt.
Schreibe mehrere text-Bloecke fuer Struktur (1 pro Section).
Verwende H2/H3 fuer Section-Headlines.
Bullet-Listen fuer Aufzaehlungen.
Optional: 1 button-Block am Ende fuer einen passenden CTA-Link.

KEINE Code-Blocks, kein Blockquote. Nur die genannten HTML-Tags.
Keine Markdown-Codefences, keine Erklaerung, NUR JSON.`;

function buildContentUserPrompt(ctx: LessonContext, length: LessonContentLength, instruction?: string): string {
  const lines = [
    "Kontext:",
    `- Kurs: ${ctx.course.title}`,
    ctx.course.summary ? `- Kurs-Beschreibung: ${ctx.course.summary}` : null,
    ctx.course.learning_objectives.length > 0
      ? `- Lernziele:\n  - ${ctx.course.learning_objectives.join("\n  - ")}`
      : null,
    `- Modul: ${ctx.module.title}`,
    ctx.module.description ? `- Modul-Beschreibung: ${ctx.module.description}` : null,
    "",
    "Aufgabe:",
    `Schreibe den Inhalt fuer die Lektion „${ctx.lesson.title}".`,
    ctx.lesson.summary ? `Kurzbeschreibung: ${ctx.lesson.summary}` : null,
    `Laenge: ${LENGTH_WORDS[length]}.`,
    instruction?.trim() ? `Zusaetzlicher Hinweis: ${instruction.trim()}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Generiert per Claude Lesson-Inhalte als Block-Liste (text + optional button).
 * Videos/Bilder/Dateien werden bewusst NICHT generiert — die fuegt der User manuell hinzu.
 */
export async function generateLessonContent(input: {
  lessonId: string;
  instruction?: string;
  length?: LessonContentLength;
}): Promise<{ blocks: LearningBlock[] } | { error: string }> {
  const ctx = await checkLearningEditor();
  if (!ctx) return { error: "Keine Berechtigung." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "ANTHROPIC_API_KEY nicht gesetzt." };

  const lessonCtx = await loadLessonContext(input.lessonId);
  if (!lessonCtx) return { error: "Lektion nicht gefunden." };

  const length = input.length ?? "medium";
  const user = buildContentUserPrompt(lessonCtx, length, input.instruction);

  try {
    const client = getClient();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: LENGTH_TOKENS[length],
      system: CONTENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { error: "AI-Antwort war kein gueltiges JSON. Bitte erneut versuchen." };
    }
    const blocks = validateAiBlocks(parsed);
    if (blocks.length === 0) return { error: "AI hat keine gueltigen Bloecke geliefert." };
    await logUsage(ctx.user.id, "content", user.length, text.length);
    return { blocks };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI-Fehler." };
  }
}
