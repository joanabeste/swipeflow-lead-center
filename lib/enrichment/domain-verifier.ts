/**
 * Verifiziert, dass eine entdeckte Domain wirklich zu einem Unternehmen gehoert.
 * Strategie: Homepage + Impressum/Kontakt-Seite scrapen und pruefen, ob ein
 * bedeutsamer Token des Firmennamens UND Ort/PLZ im Text vorkommen.
 *
 * Wichtig fuer den Anreicherungs-Flow: wenn keine Website hinterlegt ist und
 * `findCompanyWebsite` einen Kandidaten geraten/gefunden hat, soll dieser nur
 * dann ins Lead uebernommen werden, wenn er nachweislich zur Firma gehoert.
 */

import { extractMeaningfulTokens } from "./website-finder";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 8_000;

const VERIFY_PATHS = ["", "/impressum", "/kontakt", "/legal", "/imprint"];

export interface VerificationResult {
  verified: boolean;
  /** Gewichteter Score (s.u.). Verified ab >= 5. */
  score: number;
  evidence: string[];
  /** Welche Pfade wurden tatsaechlich erreicht. */
  reachedUrls: string[];
}

/**
 * Strippt HTML-Tags und normalisiert Whitespace + diakritische Zeichen, sodass
 * "Bückeburg" auch in "Bueckeburg"-Schreibweisen getroffen wird.
 */
export function normalizeText(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ");
}

async function fetchAsText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("xml") && ct !== "") return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Verifiziert die Domain.
 *
 * Score-Mechanik (max 9):
 *  - +3 wenn ein bedeutsamer Firmennamen-Token im sichtbaren Text vorkommt
 *  - +3 wenn die PLZ vorkommt (eindeutiger als Stadtname)
 *  - +2 wenn der Stadtname vorkommt
 *  - +1 wenn "impressum" auftaucht (= Impressum-Seite existiert => Profi-Indikator)
 *
 * Pflicht: Token-Match. Ohne ihn ist `verified` immer `false`, auch bei hohem
 * Score — sonst wuerde jede deutsche Firmen-Webseite mit Impressum + PLZ
 * faelschlich als Match durchgehen (False-Positive-Falle).
 *
 * `verified` ab Token-Match UND Score >= 5 (typisch: Token + Stadt, oder
 * Token + PLZ).
 */
export async function verifyDomainOwnership(
  domain: string,
  companyName: string,
  city?: string | null,
  zip?: string | null,
): Promise<VerificationResult> {
  const tokens = extractMeaningfulTokens(companyName);
  const meaningful = tokens.filter((t) => t.length >= 4);

  // Alle Verify-Pfade parallel holen, einmal als kombiniert-Text auswerten.
  const urls = VERIFY_PATHS.map((p) => `https://${domain}${p}`);
  const texts = await Promise.all(urls.map(fetchAsText));

  const reachedUrls: string[] = [];
  const combinedRaw = texts
    .map((t, i) => {
      if (t) reachedUrls.push(urls[i]);
      return t ?? "";
    })
    .join(" ");

  if (reachedUrls.length === 0) {
    return { verified: false, score: 0, evidence: ["domain nicht erreichbar"], reachedUrls: [] };
  }

  const combined = normalizeText(combinedRaw);

  let score = 0;
  const evidence: string[] = [];

  // Token-Match (mind. ein bedeutsamer Token; hyphen wird ignoriert)
  const matchedToken = meaningful.find((t) => combined.includes(t.replace(/-/g, "")));
  if (matchedToken) {
    score += 3;
    evidence.push(`firmenname-token "${matchedToken}" gefunden`);
  }

  // PLZ-Match (Wortgrenze, damit "12345" nicht in einer Telefonnummer matcht)
  if (zip) {
    const zipNorm = zip.replace(/\s/g, "");
    if (zipNorm.length >= 4) {
      const re = new RegExp(`\\b${zipNorm}\\b`);
      if (re.test(combined)) {
        score += 3;
        evidence.push(`plz "${zipNorm}" gefunden`);
      }
    }
  }

  // Stadt-Match
  if (city) {
    const cityNorm = normalizeText(city).trim();
    if (cityNorm.length >= 3 && combined.includes(cityNorm)) {
      score += 2;
      evidence.push(`stadt "${cityNorm}" gefunden`);
    }
  }

  // Impressum-Indikator
  if (combined.includes("impressum")) {
    score += 1;
    evidence.push("impressum-section vorhanden");
  }

  return {
    verified: Boolean(matchedToken) && score >= 5,
    score,
    evidence,
    reachedUrls,
  };
}
