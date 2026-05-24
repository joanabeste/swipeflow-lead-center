/**
 * Findet die Website eines Unternehmens anhand des Firmennamens.
 * Versucht mehrere Suchmaschinen: Brave → Google → DuckDuckGo → Bing
 * + heuristisches Domain-Guessing + LLM-Disambiguation als Last Resort.
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SKIP_DOMAINS = [
  "facebook.com", "linkedin.com", "xing.com", "twitter.com", "instagram.com",
  "youtube.com", "wikipedia.org", "yelp.de", "gelbeseiten.de", "11880.com",
  "golocal.de", "kununu.com", "glassdoor.de", "indeed.de", "stepstone.de",
  "google.com", "google.de", "bing.com", "duckduckgo.com",
  "amazon.de", "ebay.de", "ebay-kleinanzeigen.de",
  "northdata.de", "firmenwissen.de", "unternehmensregister.de",
  "tiktok.com", "pinterest.de", "tripadvisor.de", "fahrschulen.de",
  "branchenbuch.de", "branchenbuchdeutschland.de", "openpr.de",
  "creditreform.de", "dnb.com", "wlw.de", "europages.de",
];

/** Generische Wörter, die in vielen Firmennamen vorkommen und zur Domain-
 *  Erkennung unbrauchbar sind. Werden beim Token-Matching ignoriert. */
const GENERIC_WORDS = new Set([
  "fahrschule", "autohaus", "baeckerei", "metzgerei", "restaurant", "hotel",
  "gasthaus", "gasthof", "praxis", "apotheke", "kanzlei", "agentur",
  "zentrum", "studio", "salon", "shop", "store", "service", "services",
  "consulting", "solutions", "group", "international", "deutschland",
  "germany", "company", "und", "und-co", "der", "die", "das", "von", "vom",
  "the", "and", "for", "fuer", "mit", "zur", "zum", "im", "am", "an",
  "gmbh", "ag", "ug", "kg", "ohg", "se", "mbh", "co", "cokg", "haftungsbeschraenkt",
  "inh", "inhaber", "inhaberin", "ev", "verein", "stiftung",
]);

/** Sucht die Website eines Unternehmens — probiert mehrere Quellen + Disambiguation */
export async function findCompanyWebsite(companyName: string, city?: string | null): Promise<string | null> {
  const tokens = extractMeaningfulTokens(companyName);
  const query = city ? `${companyName} ${city}` : companyName;

  // Sammelt alle Kandidaten (Domain + Quelle) aus allen Suchen, deduplizierte
  // und finale Auswahl erfolgt am Ende — so kann der LLM-Disambiguator alles sehen.
  const candidates: { domain: string; source: string }[] = [];

  // 1. Brave Search API (wenn API-Key gesetzt) — zuverlässigste Quelle
  const braveResults = await searchBraveAll(query);
  for (const d of braveResults) candidates.push({ domain: d, source: "brave" });

  // Brave-Top-Treffer ist meist sehr gut — wenn er strikt zum Namen passt: direkt zurück.
  const braveStrict = braveResults.find((d) => isStrictlyRelevant(d, tokens));
  if (braveStrict) return braveStrict;

  // 2. Google-Scraping (oft durch CAPTCHA blockiert)
  const googleAll = await searchGoogleAll(query);
  for (const d of googleAll) candidates.push({ domain: d, source: "google" });

  // 3. DuckDuckGo
  const ddgAll = await searchDuckDuckGoAll(query);
  for (const d of ddgAll) candidates.push({ domain: d, source: "ddg" });

  // 4. Bing
  const bingAll = await searchBingAll(query);
  for (const d of bingAll) candidates.push({ domain: d, source: "bing" });

  // Strict-Match aus den anderen Suchmaschinen
  for (const c of candidates) {
    if (isStrictlyRelevant(c.domain, tokens)) return c.domain;
  }

  // 5. Heuristisches Domain-Guessing (HEAD-Probe). KEIN early-return — die
  // Guesses fliessen als zusaetzliche Kandidaten in den LLM-Disambiguator
  // (Schritt 6). Frueher wurde guessed[0] blind zurueckgeliefert, was bei
  // schwachen Vermutungen (z.B. „bernd.com" aus „Bernd Burmester Dachdeckerei")
  // zu unsinnigen „Domain-Kandidat … konnte nicht bestaetigt werden"-Fehlern
  // fuehrte, weil der Verifier sie nachgelagert wieder verwerfen musste.
  const guessed = await guessDomainsFromTokens(tokens);
  for (const d of guessed) candidates.push({ domain: d, source: "guess" });

  // 6. LLM-Disambiguation als Last Resort, wenn die Suchen Treffer hatten,
  // aber kein striktes Token-Match gefunden wurde. Wir schicken die Top-N
  // Kandidaten + den Firmennamen + die Stadt an Claude und lassen wählen.
  if (candidates.length > 0) {
    const llmPick = await pickWebsiteWithLLM(companyName, city ?? null, candidates);
    if (llmPick) return llmPick;
  }

  // 7. Fallback: erstes nicht-skip Such-Ergebnis (lieber irgendwas als nichts —
  // der nachfolgende LLM-Extractor fängt Falsch-Treffer ab und qualifiziert nicht).
  for (const c of candidates) {
    if (!SKIP_DOMAINS.some((s) => c.domain.includes(s))) return c.domain;
  }

  return null;
}

/** Extrahiert alle Tokens aus dem Firmennamen, die für Domain-Suche relevant sind.
 *  Enthält Eigennamen, Branchen-Wörter (für „fahrschule-pagel"-Patterns) und
 *  Bindestrich-Pairs (für „acryl-decor"-Patterns). Rechtsformen (gmbh/ag/…)
 *  werden ausgefiltert, weil sie nie Teil einer Domain sind. */
export function extractMeaningfulTokens(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[.,()&/+]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ");
  const raw = cleaned.split(/[\s-]+/).filter(Boolean);

  // Rechtsformen + offensichtliche Bindewörter komplett raus, der Rest bleibt
  // (auch generische Branchen-Wörter wie „fahrschule" werden für Variant-Bauen
  // gebraucht, z.B. „fahrschule-pagel.de").
  const tokens = raw.filter((w) => w.length >= 3 && !LEGAL_FORM_WORDS.has(w));

  // Bindestrich-Pairs als zusätzliche Tokens — „acryl-decor", „kfz-mueller", etc.
  // Werden vor die Standard-Tokens gestellt, weil sie spezifischer sind.
  const hyphenPairs = (cleaned.match(/\b[a-z0-9]+-[a-z0-9]+\b/g) ?? [])
    .filter((p) => p.length >= 5 && !LEGAL_FORM_WORDS.has(p));

  return [...hyphenPairs, ...tokens];
}

/** Rechtsformen + Konjunktionen, die nie Teil einer Domain sind. */
const LEGAL_FORM_WORDS = new Set([
  "gmbh", "ag", "ug", "kg", "ohg", "se", "mbh", "co", "cokg", "haftungsbeschraenkt",
  "inh", "inhaber", "inhaberin", "ev", "verein", "stiftung",
  "und", "und-co", "der", "die", "das", "von", "vom",
  "the", "and", "for", "fuer", "mit", "zur", "zum", "im", "am", "an",
]);

/** Strikte Relevanz-Prüfung: Domain muss mindestens einen bedeutungsvollen
 *  (= nicht-generischen) Token komplett enthalten. */
function isStrictlyRelevant(domain: string, tokens: string[]): boolean {
  if (SKIP_DOMAINS.some((s) => domain.includes(s))) return false;
  const meaningful = tokens.filter((t) => !GENERIC_WORDS.has(t));
  if (meaningful.length === 0) return false;
  const normalizedDomain = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const minLen = meaningful.length === 1 ? 3 : 4;
  return meaningful.some((t) => {
    const norm = t.replace(/-/g, "");
    return norm.length >= minLen && normalizedDomain.includes(norm);
  });
}

/**
 * Baut aus dem Firmennamen plausible Domain-Varianten und probiert sie via
 * HEAD-Request. Gibt die erste erreichbare Domain zurück (Status < 400).
 *
 * Bewusst kein Content-Check: falsche Treffer (parked, Fremdfirma) werden
 * vom nachfolgenden LLM-Extractor aussortiert — besser als der komplette
 * Enrichment-Abbruch beim `null`-Return.
 */
/**
 * Generiert plausible Domain-Kandidaten aus den Firmennamen-Tokens und
 * prüft sie via HEAD-Request. Gibt alle erreichbaren Domains in
 * Plausibilitäts-Reihenfolge zurück.
 *
 * Erzeugt z.B. für "Fahrschule Michael Pagel":
 *   - fahrschule-michael-pagel.de, fahrschule-pagel.de, michael-pagel.de
 *   - pagel.de, fahrschulemichaelpagel.de, …
 */
async function guessDomainsFromTokens(tokens: string[]): Promise<string[]> {
  if (tokens.length === 0) return [];

  // Bindestrich-Pairs (z.B. „acryl-decor") werden als komplette Variante übernommen,
  // einzelne Tokens davon getrennt behandelt.
  const hyphenPairs = tokens.filter((t) => t.includes("-"));
  const singleTokens = tokens.filter((t) => !t.includes("-"));

  // Branchen-Wort aus dem Original (vor der Filterung), um z.B. „fahrschule-pagel" zu bauen
  const meaningful = singleTokens.filter((t) => !GENERIC_WORDS.has(t));
  if (meaningful.length === 0 && hyphenPairs.length === 0) return [];

  const variants = new Set<string>();

  // 0. Bindestrich-Pairs direkt als Domain (z.B. „acryl-decor", „kfz-mueller")
  for (const pair of hyphenPairs) {
    variants.add(pair);
    variants.add(pair.replace(/-/g, ""));
  }

  // 1. Volle Token-Liste (nur Single-Tokens, sonst Doppelung mit hyphenPairs)
  if (singleTokens.length > 0) {
    variants.add(singleTokens.join("-"));
    variants.add(singleTokens.join(""));
  }

  // 2. Nur bedeutungsvolle Tokens (ohne Branchen-Wörter)
  if (meaningful.length >= 1) {
    variants.add(meaningful.join("-"));
    variants.add(meaningful.join(""));
  }

  // 3. Erste 2 meaningful Tokens als Marken-Phrase (z.B. „erwin-quarder",
  //    „acryl-decor" wenn aus „acryl decor busse" ohne Bindestrich kommt)
  if (meaningful.length >= 2) {
    const firstTwo = meaningful.slice(0, 2);
    variants.add(firstTwo.join("-"));
    variants.add(firstTwo.join(""));
  }

  // 4. (entfernt) Solo-Tokens als Domain — „bernd.com", „eberhard.de" usw.
  //    waren in 99% der Faelle falsche Vermutungen; jetzt nicht mehr generiert.

  // 6. Erster + letzter Token (Vor- + Nachname Pattern). Nur die natuerliche
  //    Reihenfolge — `last-first` (umgekehrt) war zu spekulativ.
  if (meaningful.length >= 2) {
    const first = meaningful[0];
    const last = meaningful[meaningful.length - 1];
    if (first.length >= 3 && last.length >= 3) {
      variants.add(`${first}-${last}`);
      variants.add(`${first}${last}`);
    }
  }

  // 7. Branchen-Wort + letzter Eigenname (z.B. „fahrschule-pagel")
  const generic = singleTokens.find((t) => GENERIC_WORDS.has(t));
  if (generic && meaningful.length >= 1) {
    const last = meaningful[meaningful.length - 1];
    if (last.length >= 3) {
      variants.add(`${generic}-${last}`);
      variants.add(`${last}-${generic}`);
      variants.add(`${generic}${last}`);
    }
  }

  const tlds = [".de", ".com", ".eu", ".at"];
  const candidates: string[] = [];
  for (const v of variants) {
    if (v.length < 3) continue;
    for (const tld of tlds) candidates.push(`${v}${tld}`);
  }

  // HEAD-Probe parallel — wir sammeln ALLE Treffer, nicht nur den ersten.
  // Reihenfolge bleibt erhalten: kürzere/spezifischere Varianten zuerst.
  const checks = candidates.map(async (domain) => {
    try {
      const res = await fetch(`https://${domain}`, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(4_000),
        headers: { "User-Agent": USER_AGENT },
      });
      return res.status < 400 ? domain : null;
    } catch {
      return null;
    }
  });
  const results = await Promise.all(checks);
  return results.filter((r): r is string => r !== null);
}

async function searchBraveAll(query: string): Promise<string[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=DE&count=8&safesearch=off`;
    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
        "Accept-Encoding": "gzip",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      web?: { results?: { url?: string }[] };
    };
    const out: string[] = [];
    for (const r of data.web?.results ?? []) {
      const domain = extractDomain(r.url ?? "");
      if (domain && !SKIP_DOMAINS.some((s) => domain.includes(s)) && !out.includes(domain)) {
        out.push(domain);
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function searchGoogleAll(query: string): Promise<string[]> {
  try {
    const url = `https://www.google.de/search?q=${encodeURIComponent(query)}&hl=de&num=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
      signal: AbortSignal.timeout(8_000),
      redirect: "follow",
    });
    if (!res.ok) return [];
    const html = await res.text();
    return extractAllDomains(html);
  } catch {
    return [];
  }
}

async function searchDuckDuckGoAll(query: string): Promise<string[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " website")}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const out: string[] = [];

    // DuckDuckGo-spezifisch: uddg-Parameter (encoded URL)
    const uddgMatches = html.match(/uddg=([^&"]+)/g) ?? [];
    for (const match of uddgMatches) {
      const decoded = decodeURIComponent(match.replace("uddg=", ""));
      const domain = extractDomain(decoded);
      if (domain && !SKIP_DOMAINS.some((s) => domain.includes(s)) && !out.includes(domain)) {
        out.push(domain);
      }
    }

    for (const d of extractAllDomains(html)) {
      if (!out.includes(d)) out.push(d);
    }
    return out;
  } catch {
    return [];
  }
}

async function searchBingAll(query: string): Promise<string[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=de&count=10`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return extractAllDomains(html);
  } catch {
    return [];
  }
}

/** Extrahiert alle Domains aus HTML-Suchergebnissen, dedupliziert, ohne Skip-Domains. */
function extractAllDomains(html: string): string[] {
  const hrefRegex = /href="(https?:\/\/[^"]+)"/g;
  const out: string[] = [];
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const domain = extractDomain(match[1]);
    if (domain && !SKIP_DOMAINS.some((s) => domain.includes(s)) && !out.includes(domain)) {
      out.push(domain);
    }
  }
  return out;
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * LLM-Disambiguation: Wenn die Suchen Treffer hatten, aber kein Token-Match
 * sicher genug war, lassen wir Claude den wahrscheinlichsten offiziellen
 * Treffer auswählen. Token-spar-Modus: max 12 Kandidaten, einzeiliger Output.
 */
async function pickWebsiteWithLLM(
  companyName: string,
  city: string | null,
  candidates: { domain: string; source: string }[],
): Promise<string | null> {
  // Dedup nach Domain, max 12 — typische Such-Top-Ergebnisse reichen
  const seen = new Set<string>();
  const dedup = candidates.filter((c) => (seen.has(c.domain) ? false : (seen.add(c.domain), true))).slice(0, 12);
  if (dedup.length === 0) return null;

  const prompt = [
    `Welche dieser Domains ist mit hoher Wahrscheinlichkeit die offizielle Website von "${companyName}"${city ? ` aus ${city}` : ""}?`,
    "Antwort NUR die Domain (z.B. fahrschule-pagel.de) ODER das Wort \"keine\" wenn keine wirklich passt.",
    "Keine Erklärung, kein https://, kein www., kein Komma, kein Punkt am Ende.",
    "",
    "Domains:",
    ...dedup.map((c, i) => `${i + 1}. ${c.domain}`),
  ].join("\n");

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();
      const res = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 40,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });
      const block = res.content.find((b) => b.type === "text");
      const answer = (block?.type === "text" ? block.text : "").trim().toLowerCase();
      return parseLLMDomainAnswer(answer, dedup.map((c) => c.domain));
    }
    if (process.env.OPENAI_API_KEY) {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI();
      const res = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        max_tokens: 40,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });
      const answer = (res.choices[0]?.message?.content ?? "").trim().toLowerCase();
      return parseLLMDomainAnswer(answer, dedup.map((c) => c.domain));
    }
  } catch {
    return null;
  }
  return null;
}

function parseLLMDomainAnswer(answer: string, candidates: string[]): string | null {
  if (!answer || answer.startsWith("keine")) return null;
  // Whitespace, http://, https://, www., trailing slash entfernen
  const cleaned = answer
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[\s,;.]+$/, "")
    .split(/\s+/)[0];
  if (!cleaned) return null;
  // Strikt: Antwort muss einer der Kandidaten sein (kein hallucinated Domain)
  const exact = candidates.find((c) => c === cleaned);
  if (exact) return exact;
  // Fuzzy: Antwort enthält eine Kandidaten-Domain als Substring
  return candidates.find((c) => cleaned.includes(c)) ?? null;
}
