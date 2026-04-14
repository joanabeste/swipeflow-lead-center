export interface FetchedPage {
  url: string;
  content: string;
  category: "homepage" | "impressum" | "team" | "karriere" | "kontakt" | "other";
  error?: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const KNOWN_PATHS: { path: string; category: FetchedPage["category"] }[] = [
  { path: "/impressum", category: "impressum" },
  { path: "/kontakt", category: "kontakt" },
  { path: "/team", category: "team" },
  { path: "/ueber-uns", category: "team" },
  { path: "/about", category: "team" },
  { path: "/about-us", category: "team" },
  { path: "/karriere", category: "karriere" },
  { path: "/karriere-bei-uns", category: "karriere" },
  { path: "/jobs", category: "karriere" },
  { path: "/stellen", category: "karriere" },
  { path: "/stellenangebote", category: "karriere" },
  { path: "/stellenanzeigen", category: "karriere" },
  { path: "/offene-stellen", category: "karriere" },
  { path: "/career", category: "karriere" },
  { path: "/careers", category: "karriere" },
  { path: "/jobs-karriere", category: "karriere" },
  { path: "/unternehmen/karriere", category: "karriere" },
  { path: "/de/karriere", category: "karriere" },
];

const LINK_KEYWORDS: Record<string, FetchedPage["category"]> = {
  impressum: "impressum",
  kontakt: "kontakt",
  contact: "kontakt",
  team: "team",
  "über uns": "team",
  "ueber uns": "team",
  "about us": "team",
  karriere: "karriere",
  career: "karriere",
  jobs: "karriere",
  stellen: "karriere",
  stellenangebote: "karriere",
  stellenanzeigen: "karriere",
  "offene stellen": "karriere",
  ausbildung: "karriere",
  ausbildungsplätze: "karriere",
  ausbildungsplatz: "karriere",
};

const MAX_CHARS_PER_PAGE = 8_000; // Reduziert von 15.000 — weniger Rauschen
const FETCH_TIMEOUT_MS = 10_000;

// In-Memory Fetch-Cache — vermeidet wiederholtes Laden derselben URLs bei
// Re-Enrichment oder Batch-Runs. Pro Instanz (Fluid Compute skaliert horizontal,
// das ist OK). Fehler werden NICHT gecached.
type CacheEntry = { fetchedAt: number; page: FetchedPage };
const pageCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 500;

function cacheGet(url: string): FetchedPage | null {
  const hit = pageCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > CACHE_TTL_MS) {
    pageCache.delete(url);
    return null;
  }
  return hit.page;
}
function cacheSet(url: string, page: FetchedPage) {
  if (page.error) return; // nur Erfolgs-Seiten cachen
  if (pageCache.size >= CACHE_MAX) {
    // simplest eviction: älteste 100 Einträge raus (Insertion-Order der Map)
    const victims: string[] = [];
    for (const k of pageCache.keys()) {
      victims.push(k);
      if (victims.length >= 100) break;
    }
    for (const k of victims) pageCache.delete(k);
  }
  pageCache.set(url, { fetchedAt: Date.now(), page });
}

/** Hauptfunktion: Holt relevante Seiten einer Firmenwebsite */
export async function fetchCompanyPages(
  websiteOrDomain: string,
  config?: { job_postings?: boolean; career_page?: boolean; contacts_management?: boolean; contacts_all?: boolean },
  careerPageHint?: string,
): Promise<{ baseUrl: string; pages: FetchedPage[] }> {
  const needsKarriere = config?.job_postings !== false && config?.career_page !== false;
  const needsTeam = config?.contacts_management !== false || config?.contacts_all === true;
  const baseUrl = buildBaseUrl(websiteOrDomain);
  const pages: FetchedPage[] = [];

  // 1. Homepage fetchen
  const homepage = await fetchPage(baseUrl, "homepage");
  pages.push(homepage);

  if (homepage.error) {
    return { baseUrl, pages };
  }

  const foundCategories = new Set<string>();

  // 1b. Bekannte Karriere-URL direkt fetchen (falls übergeben, z.B. aus BA-Import)
  if (needsKarriere && careerPageHint) {
    const hintUrl = careerPageHint.startsWith("http") ? careerPageHint : `https://${careerPageHint}`;
    const careerPage = await fetchPage(hintUrl, "karriere");
    if (!careerPage.error) {
      pages.push(careerPage);
      foundCategories.add("karriere");
    }
  }

  // 2. Bekannte Pfade ausprobieren (Kategorien filtern nach Config)
  const filteredPaths = KNOWN_PATHS.filter(({ category }) => {
    if (category === "karriere" && (!needsKarriere || foundCategories.has("karriere"))) return false;
    if (category === "team" && !needsTeam) return false;
    return true;
  });
  const subPagePromises = filteredPaths.map(async ({ path, category }) => {
    if (foundCategories.has(category)) return null;
    const url = new URL(path, baseUrl).toString();
    const page = await fetchPage(url, category);
    if (!page.error) {
      foundCategories.add(category);
      return page;
    }
    return null;
  });

  const subPages = await Promise.all(subPagePromises);
  for (const page of subPages) {
    if (page) pages.push(page);
  }

  // 3. Falls Kategorien fehlen, Links von der Homepage parsen
  const missingCategories = ["impressum", "karriere", "team", "kontakt"].filter(
    (c) => !foundCategories.has(c),
  );

  if (missingCategories.length > 0 && homepage.content) {
    const discoveredLinks = discoverLinks(homepage.content, baseUrl);
    for (const link of discoveredLinks) {
      if (foundCategories.has(link.category)) continue;
      if (missingCategories.includes(link.category)) {
        const page = await fetchPage(link.url, link.category);
        if (!page.error) {
          pages.push(page);
          foundCategories.add(link.category);
        }
      }
    }
  }

  // 4. Falls Karriereseite gefunden, von DORT aus Job-Detail-/Listen-Links folgen
  // Viele Firmen haben /karriere als Hub mit Links zu /karriere/<job> oder externen Boards.
  if (needsKarriere) {
    const karrierePages = pages.filter((p) => p.category === "karriere" && !p.error && p.content);
    const visitedUrls = new Set(pages.map((p) => p.url));
    const extraJobUrls: string[] = [];
    for (const kp of karrierePages) {
      // Hole Original-HTML noch mal, weil cleaned content keine href-Attribute hat
      try {
        const r = await fetch(kp.url, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: "follow",
        });
        if (!r.ok) continue;
        const html = await r.text();
        const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = linkRegex.exec(html)) !== null) {
          try {
            const absolute = new URL(m[1], kp.url).toString().split("#")[0];
            if (visitedUrls.has(absolute)) continue;
            // Nur interne Links und nur welche, die nach Job-Detail aussehen
            const text = m[2].replace(/<[^>]+>/g, " ").toLowerCase();
            const looksLikeJob =
              /(stellenangebot|stellenanzeige|ausbildung|m\/w\/d|w\/m\/d|industriekaufmann|industriemechaniker|werkstudent|praktikum|trainee|duales studium|jobdetail|job-detail|stelle\/|jobs\/|ausbildung-)/i.test(absolute) ||
              /(stellenangebot|stellenanzeige|ausbildung|m\/w\/d|w\/m\/d|werkstudent|praktikum|trainee|duales studium|jetzt bewerben|details|mehr erfahren|zur stelle)/i.test(text);
            if (!looksLikeJob) continue;
            // Auch externe Job-Boards erlauben (Personio, Softgarden, d.vinci, Smart Recruiters, Greenhouse)
            const isExternalBoard = /(personio|softgarden|dvinci|d-vinci|smartrecruiters|greenhouse|workable|recruitee|join\.com|jobs\.[\w-]+\.[a-z]{2,})/i.test(absolute);
            if (!absolute.startsWith(baseUrl) && !isExternalBoard) continue;
            extraJobUrls.push(absolute);
            visitedUrls.add(absolute);
            if (extraJobUrls.length >= 8) break;
          } catch {
            // ignore
          }
        }
        if (extraJobUrls.length >= 8) break;
      } catch {
        // ignore karriere-page re-fetch failure
      }
    }

    // Bis zu 8 zusätzliche Job-Seiten parallel holen — als "karriere" kategorisiert,
    // damit ihr Inhalt zusammen mit der Karriere-Hauptseite ans LLM geht.
    const extraPages = await Promise.all(
      extraJobUrls.slice(0, 8).map((url) => fetchPage(url, "karriere")),
    );
    for (const ep of extraPages) {
      if (!ep.error && ep.content) pages.push(ep);
    }
  }

  return { baseUrl, pages };
}

function buildBaseUrl(websiteOrDomain: string): string {
  let url = websiteOrDomain.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  // Trailing Slash entfernen
  return url.replace(/\/+$/, "");
}

async function fetchPage(
  url: string,
  category: FetchedPage["category"],
): Promise<FetchedPage> {
  // Cache-Key ist die URL + Kategorie (verschiedene Kategorien → unterschiedliches cleanHtml).
  const cacheKey = `${category}|${url}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { url, content: "", category, error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return { url, content: "", category, error: "Kein HTML" };
    }

    let html = await res.text();

    // Karriere-Seiten enthalten oft iframes zu externen Job-Boards (Personio, d.vinci, Softgarden…)
    // → iframe-Inhalte anfügen BEVOR die iframes weggestrippt werden.
    if (category === "karriere") {
      const iframeExtra = await fetchIframeContents(html, url);
      if (iframeExtra) html = html + "\n\n" + iframeExtra;
    }

    const content = cleanHtml(html, category).slice(0, MAX_CHARS_PER_PAGE);

    const page: FetchedPage = { url, content, category };
    cacheSet(cacheKey, page);
    return page;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fetch fehlgeschlagen";
    return { url, content: "", category, error: message };
  }
}

/** Entfernt HTML-Tags und extrahiert sichtbaren Text, mit kategorie-spezifischer Filterung */
/** Holt HTML aller iframes einer Seite — für Job-Boards wie Personio, d.vinci, Softgarden */
async function fetchIframeContents(html: string, baseUrl: string): Promise<string | null> {
  const iframeSrcs = new Set<string>();
  const srcRegex = /<iframe[^>]*\bsrc=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = srcRegex.exec(html)) !== null) {
    try {
      const absolute = new URL(match[1], baseUrl).toString();
      // Nur http(s) — keine data: URIs, javascript: etc.
      if (absolute.startsWith("http")) iframeSrcs.add(absolute);
    } catch {
      // ignore
    }
  }
  if (iframeSrcs.size === 0) return null;

  const parts: string[] = [];
  for (const src of Array.from(iframeSrcs).slice(0, 3)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const r = await fetch(src, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("text/html")) continue;
      const inner = await r.text();
      parts.push(`<!-- iframe:${src} -->\n${inner}`);
    } catch {
      // ignore individual failures
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function cleanHtml(html: string, category: FetchedPage["category"]): string {
  let text = html;

  // Script, Style, Nav, Footer, Sidebar, Cookie-Banner entfernen
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  text = text.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");

  // Bei Karriere/Kontakt: Link-Ziele als "TEXT [URL]" erhalten, BEVOR alle Tags
  // gestrippt werden. So bekommt das LLM Job-URLs zum Befüllen von `url`.
  if (category === "karriere" || category === "kontakt") {
    text = text.replace(
      /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, inner: string) => {
        const visible = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (!visible) return "";
        // nur "echte" Links behalten — Mail/Tel/Anker passen nicht zu Jobs
        if (/^(mailto:|tel:|#|javascript:)/i.test(href)) return visible;
        return `${visible} [${href}]`;
      },
    );
  }

  // Navigation und Footer nur bei Homepage/Other entfernen (Impressum braucht sie evtl.)
  if (category === "homepage" || category === "other") {
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");
    text = text.replace(/<header[\s\S]*?<\/header>/gi, "");
  }

  // Cookie-Banner, Popups, Sidebars
  text = text.replace(/<div[^>]*(?:cookie|consent|banner|popup|modal|overlay|sidebar|widget)[^>]*>[\s\S]*?<\/div>/gi, "");

  // Block-Elemente durch Newlines ersetzen
  text = text.replace(/<\/(div|p|h[1-6]|li|tr|td|th|br|hr|section|article)[^>]*>/gi, "\n");
  text = text.replace(/<(br|hr)\s*\/?>/gi, "\n");

  // Alle verbleibenden Tags entfernen
  text = text.replace(/<[^>]+>/g, " ");

  // HTML-Entities dekodieren
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&#\d+;/g, " ");

  // Whitespace bereinigen
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n");

  // Wiederholte kurze Zeilen entfernen (Menü-Items, Breadcrumbs)
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const dedupedLines: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    // Kurze Zeilen (<20 chars) die sich wiederholen → überspringen
    if (line.length < 20 && seen.has(line)) continue;
    seen.add(line);
    dedupedLines.push(line);
  }

  return dedupedLines.join("\n").trim();
}

/** Findet Links auf der Homepage die zu relevanten Unterseiten führen */
function discoverLinks(
  homepageHtml: string,
  baseUrl: string,
): { url: string; category: FetchedPage["category"] }[] {
  const results: { url: string; category: FetchedPage["category"] }[] = [];
  // Suche nach <a href="...">text</a> Patterns
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(homepageHtml)) !== null) {
    const href = match[1];
    const anchorText = match[2].replace(/<[^>]+>/g, "").toLowerCase().trim();

    for (const [keyword, category] of Object.entries(LINK_KEYWORDS)) {
      if (anchorText.includes(keyword) || href.toLowerCase().includes(keyword)) {
        try {
          const absoluteUrl = new URL(href, baseUrl).toString();
          // Nur interne Links
          if (absoluteUrl.startsWith(baseUrl)) {
            results.push({ url: absoluteUrl, category });
          }
        } catch {
          // Ungültige URL ignorieren
        }
        break;
      }
    }
  }

  return results;
}
