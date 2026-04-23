import { buildBuiltInContext, renderTemplate } from "@/lib/email/templates";
import type { ContactSalutation } from "@/lib/types";
import type { CaseStudy, Industry } from "./types";

/**
 * Wandelt eine Loom-Share-URL in eine Embed-URL. Akzeptiert beide Formen
 * ("loom.com/share/<id>" und "loom.com/embed/<id>") und lässt alles andere
 * unverändert, damit der Nutzer notfalls auch direkt eine fertige Embed-URL
 * einsetzen kann.
 */
export function toLoomEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (!m) return null;
  return `https://www.loom.com/embed/${m[1]}`;
}

export interface SnapshotInput {
  industry: Industry;
  contact: {
    name: string | null;
    role: string | null;
    salutation: ContactSalutation | null;
  } | null;
  companyName: string;
  senderName: string | null;
  caseStudies: CaseStudy[];
}

export interface SnapshotDraft {
  greeting: string;
  headline: string;
  intro_text: string;
  outro_text: string | null;
  loom_url: string | null;
  calendly_url: string | null;
  case_study_ids: string[];
}

/**
 * Rendert die Default-Templates einer Branche zu einem editierbaren
 * Landing-Page-Draft. Der Anwender kann die Felder danach überschreiben,
 * bevor die Page persistiert wird.
 */
export function buildDefaultSnapshot(input: SnapshotInput): SnapshotDraft {
  const ctx = buildBuiltInContext({
    contactName: input.contact?.name ?? null,
    contactRole: input.contact?.role ?? null,
    contactSalutation: input.contact?.salutation ?? null,
    companyName: input.companyName,
    senderName: input.senderName,
  });

  const preselectedIds = input.caseStudies
    .filter((s) => s.is_active && (s.industry_id === input.industry.id || s.industry_id === null))
    .map((s) => s.id);

  return {
    greeting: renderTemplate(input.industry.greeting_template, ctx),
    headline: renderTemplate(input.industry.headline_template, ctx),
    intro_text: renderTemplate(input.industry.intro_template, ctx),
    outro_text: input.industry.outro_template
      ? renderTemplate(input.industry.outro_template, ctx)
      : null,
    loom_url: input.industry.loom_url,
    calendly_url: input.industry.calendly_url,
    case_study_ids: preselectedIds,
  };
}
