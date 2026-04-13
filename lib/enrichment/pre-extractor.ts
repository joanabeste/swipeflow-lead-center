/**
 * Regex-basierte Vorab-Extraktion von Kontaktdaten.
 * Reduziert die Datenmenge die an die LLM-API gesendet werden muss.
 */

export interface PreExtractedData {
  emails: string[];
  phones: string[];
  urls: string[];
  /** Textabschnitte die wahrscheinlich Kontaktinfos enthalten */
  relevantSections: string[];
}

// E-Mail Pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Deutsche Telefonnummern
const PHONE_REGEX = /(?:\+49|0049|0)\s*[\d\s/\-().]{6,20}\d/g;

// URL Pattern
const URL_REGEX = /https?:\/\/[^\s"'<>]+/g;

/** Extrahiert E-Mails, Telefonnummern und URLs aus Rohtext */
export function preExtract(text: string): PreExtractedData {
  const emails = [...new Set(
    (text.match(EMAIL_REGEX) ?? [])
      .map((e) => e.toLowerCase())
      .filter((e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.includes("example"))
  )];

  const phones = [...new Set(
    (text.match(PHONE_REGEX) ?? [])
      .map((p) => p.replace(/[\s/\-().]/g, "").replace(/^0049/, "+49").replace(/^0/, "+49"))
      .filter((p) => p.length >= 10 && p.length <= 16)
  )];

  const urls = [...new Set(
    (text.match(URL_REGEX) ?? [])
      .filter((u) => !u.endsWith(".css") && !u.endsWith(".js") && !u.endsWith(".woff2"))
  )];

  // Relevante Textabschnitte finden (Absätze mit Kontakt-Keywords)
  const contactKeywords = [
    "geschäftsführ", "inhaber", "leitung", "personal", "ansprechpartner",
    "kontakt", "impressum", "tel", "fon", "telefon", "e-mail", "mail@",
    "@", "stellenangebot", "karriere", "job", "vakanz", "stelle",
    "gründ", "mitarbeiter", "beschäftigt",
  ];

  const lines = text.split("\n");
  const relevantSections: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (contactKeywords.some((kw) => line.includes(kw))) {
      // Kontext: 2 Zeilen davor und danach
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 3);
      const section = lines.slice(start, end).join("\n").trim();
      if (section.length > 10 && section.length < 2000) {
        relevantSections.push(section);
      }
    }
  }

  // Deduplizieren und auf 20 Abschnitte begrenzen
  const uniqueSections = [...new Set(relevantSections)].slice(0, 20);

  return { emails, phones, urls, relevantSections: uniqueSections };
}

/** Komprimiert Seitentext auf die relevantesten Teile */
export function compressPageContent(text: string, maxChars: number): string {
  const { relevantSections } = preExtract(text);

  if (relevantSections.length === 0) {
    // Fallback: ersten Teil des Textes nehmen
    return text.slice(0, maxChars);
  }

  // Relevante Abschnitte zusammenfügen
  let result = "";
  for (const section of relevantSections) {
    if (result.length + section.length + 10 > maxChars) break;
    result += section + "\n---\n";
  }

  // Wenn noch Platz: Rest des Textes auffüllen
  if (result.length < maxChars * 0.5) {
    const remaining = maxChars - result.length;
    result += "\n" + text.slice(0, remaining);
  }

  return result.trim();
}
