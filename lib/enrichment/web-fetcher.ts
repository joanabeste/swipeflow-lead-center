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
  { path: "/jobs", category: "karriere" },
  { path: "/stellenangebote", category: "karriere" },
  { path: "/career", category: "karriere" },
  { path: "/careers", category: "karriere" },
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
};

const MAX_CHARS_PER_PAGE = 8_000; // Reduziert von 15.000 — weniger Rauschen
const FETCH_TIMEOUT_MS = 10_000;

/** Hauptfunktion: Holt relevante Seiten einer Firmenwebsite */
export async function fetchCompanyPages(
  websiteOrDomain: string,
  config?: { job_postings?: boolean; career_page?: boolean; contacts_management?: boolean; contacts_all?: boolean },
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

  // 2. Bekannte Pfade ausprobieren (Kategorien filtern nach Config)
  const foundCategories = new Set<string>();
  const filteredPaths = KNOWN_PATHS.filter(({ category }) => {
    if (category === "karriere" && !needsKarriere) return false;
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

    const html = await res.text();
    const content = cleanHtml(html, category).slice(0, MAX_CHARS_PER_PAGE);

    return { url, content, category };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fetch fehlgeschlagen";
    return { url, content: "", category, error: message };
  }
}

/** Entfernt HTML-Tags und extrahiert sichtbaren Text, mit kategorie-spezifischer Filterung */
function cleanHtml(html: string, category: FetchedPage["category"]): string {
  let text = html;

  // Script, Style, Nav, Footer, Sidebar, Cookie-Banner entfernen
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  text = text.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");

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
