/**
 * Analysiert Stellenbeschreibungen der Bundesagentur für Arbeit.
 * Extrahiert Firmendaten per Regex — kein API-Call nötig in 95% der Fälle.
 */

export interface JobDescriptionData {
  companySize: string | null;
  city: string | null;
  zip: string | null;
  street: string | null;
  industry: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

// Mitarbeiterzahl-Patterns
const EMPLOYEE_PATTERNS = [
  /(?:ca\.?\s*|rund\s*|über\s*|mehr als\s*|mit\s*|unseren?\s*)(\d[\d.]*)\s*(?:mitarbeiter|beschäftigte|kolleg|angestellt)/i,
  /(\d[\d.]*)\s*(?:mitarbeiter|beschäftigte|kolleg)/i,
  /team\s*(?:von|mit)\s*(?:ca\.?\s*|rund\s*)?(\d[\d.]*)/i,
];

// PLZ + Stadt (deutsche 5-stellige PLZ)
const ZIP_CITY_PATTERN = /\b(\d{5})\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+)*)\b/g;

// Straße + Hausnummer
const STREET_PATTERNS = [
  /([A-ZÄÖÜ][a-zäöüß]+(?:straße|str\.|weg|allee|ring|platz|damm|gasse|pfad|ufer|chaussee))\s+(\d+[\s-]?\d*)/gi,
  /([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+)*(?:straße|str\.))\s+(\d+[\s-]?\d*)/gi,
];

// E-Mail im Beschreibungstext
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Telefon im Beschreibungstext
const PHONE_PATTERN = /(?:tel\.?|telefon|fon|rufnummer)[:\s]*([+\d\s/()\-]{8,20})/gi;

// Kontaktperson aus "z.Hd." oder "Ansprechpartner" Patterns
const CONTACT_PATTERNS = [
  /(?:z\.?\s*h(?:d|dn?)\.?|ansprechpartner(?:in)?|kontakt)[:\s]*(?:(?:frau|herr)\s+)?([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,3})/gi,
  /(?:frau|herr)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,2})/gi,
];

/** Extrahiert strukturierte Daten aus einer Stellenbeschreibung per Regex */
export function analyzeJobDescription(description: string): JobDescriptionData {
  if (!description) return emptyResult();

  // Encoding-Probleme bereinigen (Mojibake von UTF-8)
  const text = description
    .replace(/Ã¤/g, "ä").replace(/Ã¶/g, "ö").replace(/Ã¼/g, "ü")
    .replace(/Ã„/g, "Ä").replace(/Ã–/g, "Ö").replace(/Ãœ/g, "Ü")
    .replace(/ÃŸ/g, "ß").replace(/â€"/g, "–").replace(/â€¢/g, "•")
    .replace(/â€œ/g, "\"").replace(/â€/g, "\"").replace(/â€˜/g, "'")
    .replace(/Â·/g, "·").replace(/Â /g, " ");

  // Mitarbeiterzahl
  let companySize: string | null = null;
  for (const pattern of EMPLOYEE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      companySize = match[1].replace(/\./g, "");
      break;
    }
  }

  // PLZ + Stadt (letzte Erwähnung ist oft die Firmenadresse)
  let city: string | null = null;
  let zip: string | null = null;
  const zipCityMatches = [...text.matchAll(ZIP_CITY_PATTERN)];
  if (zipCityMatches.length > 0) {
    // Letzte Erwähnung = wahrscheinlich Firmenadresse im Footer
    const last = zipCityMatches[zipCityMatches.length - 1];
    zip = last[1];
    city = last[2];
  }

  // Straße
  let street: string | null = null;
  for (const pattern of STREET_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      street = match[0];
      break;
    }
  }

  // E-Mail aus Beschreibung (letzte ist oft die Bewerbungs-Mail)
  const emails = text.match(EMAIL_PATTERN);
  const contactEmail = emails && emails.length > 0 ? emails[emails.length - 1].toLowerCase() : null;

  // Telefon aus Beschreibung
  let contactPhone: string | null = null;
  const phoneMatch = PHONE_PATTERN.exec(text);
  if (phoneMatch) {
    contactPhone = phoneMatch[1].replace(/[\s/()-]/g, "").replace(/^0/, "+49");
  }

  // Kontaktperson
  let contactName: string | null = null;
  for (const pattern of CONTACT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      contactName = match[1].trim();
      break;
    }
  }

  return {
    companySize,
    city,
    zip,
    street,
    industry: null, // Branche ist per Regex zu unzuverlässig
    contactName,
    contactEmail,
    contactPhone,
  };
}

function emptyResult(): JobDescriptionData {
  return { companySize: null, city: null, zip: null, street: null, industry: null, contactName: null, contactEmail: null, contactPhone: null };
}
