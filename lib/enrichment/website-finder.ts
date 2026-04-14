/**
 * Findet die Website eines Unternehmens anhand des Firmennamens.
 * Versucht mehrere Suchmaschinen: Google → DuckDuckGo → Bing
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
];

/** Sucht die Website eines Unternehmens — probiert mehrere Quellen */
export async function findCompanyWebsite(companyName: string, city?: string | null): Promise<string | null> {
  const query = city
    ? `${companyName} ${city}`
    : companyName;

  // 1. Brave Search API (wenn API-Key gesetzt) — zuverlässigste Quelle
  const braveResult = await searchBrave(query);
  if (braveResult) return braveResult;

  // 2. Google-Scraping (oft durch CAPTCHA blockiert)
  const googleResult = await searchGoogle(query);
  if (googleResult) return googleResult;

  // 3. DuckDuckGo als Fallback
  const ddgResult = await searchDuckDuckGo(query);
  if (ddgResult) return ddgResult;

  // 4. Bing als letzter Fallback
  const bingResult = await searchBing(query);
  if (bingResult) return bingResult;

  return null;
}

async function searchBrave(query: string): Promise<string | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&country=DE&count=5&safesearch=off`;
    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
        "Accept-Encoding": "gzip",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      web?: { results?: { url?: string }[] };
    };
    const results = data.web?.results ?? [];
    // Erst relevante Domain finden, sonst erstes verwertbares Ergebnis
    for (const r of results) {
      const domain = extractDomain(r.url ?? "");
      if (domain && !SKIP_DOMAINS.some((s) => domain.includes(s)) && isRelevantDomain(domain, query)) {
        return domain;
      }
    }
    for (const r of results) {
      const domain = extractDomain(r.url ?? "");
      if (domain && !SKIP_DOMAINS.some((s) => domain.includes(s))) return domain;
    }
    return null;
  } catch {
    return null;
  }
}

async function searchGoogle(query: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const url = `https://www.google.de/search?q=${encodeURIComponent(query)}&hl=de&num=5`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "de-DE,de;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    return extractFirstRelevantDomain(html, query);
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " website")}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();

    // DuckDuckGo-spezifisch: uddg-Parameter
    const uddgMatches = html.match(/uddg=([^&"]+)/g);
    if (uddgMatches) {
      for (const match of uddgMatches) {
        const encoded = match.replace("uddg=", "");
        const decoded = decodeURIComponent(encoded);
        const domain = extractDomain(decoded);
        if (domain && isRelevantDomain(domain, query)) return domain;
      }
    }

    return extractFirstRelevantDomain(html, query);
  } catch {
    return null;
  }
}

async function searchBing(query: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=de`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();
    return extractFirstRelevantDomain(html, query);
  } catch {
    return null;
  }
}

/** Extrahiert die erste relevante Domain aus HTML-Suchergebnissen */
function extractFirstRelevantDomain(html: string, query: string): string | null {
  // URLs aus href-Attributen extrahieren
  const hrefRegex = /href="(https?:\/\/[^"]+)"/g;
  let match;
  const candidates: string[] = [];

  while ((match = hrefRegex.exec(html)) !== null) {
    const domain = extractDomain(match[1]);
    if (domain && !SKIP_DOMAINS.some((skip) => domain.includes(skip))) {
      candidates.push(domain);
    }
  }

  // Deduplizieren
  const unique = [...new Set(candidates)];

  // Erst nach Namens-Ähnlichkeit sortieren
  const normalizedQuery = normalizeForComparison(query);

  for (const domain of unique) {
    if (isRelevantDomain(domain, query)) return domain;
  }

  // Fallback: erstes nicht-skip Ergebnis
  return unique[0] ?? null;
}

/** Prüft ob eine Domain zum Suchbegriff passt */
function isRelevantDomain(domain: string, query: string): boolean {
  if (SKIP_DOMAINS.some((skip) => domain.includes(skip))) return false;

  const normalizedDomain = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  const normalizedQuery = normalizeForComparison(query);

  // Domain enthält Teil des Namens oder umgekehrt
  if (normalizedQuery.length >= 4 && normalizedDomain.includes(normalizedQuery.slice(0, Math.min(8, normalizedQuery.length)))) return true;
  if (normalizedDomain.length >= 4 && normalizedQuery.includes(normalizedDomain.slice(0, Math.min(8, normalizedDomain.length)))) return true;

  return false;
}

function normalizeForComparison(name: string): string {
  return name.toLowerCase()
    .replace(/[äÄ]/g, "ae").replace(/[öÖ]/g, "oe").replace(/[üÜ]/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(gmbh|ag|ug|kg|ohg|se|mbh|co|cokg|haftungsbeschraenkt)/g, "");
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
