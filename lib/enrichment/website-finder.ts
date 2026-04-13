/**
 * Findet die Website eines Unternehmens anhand des Firmennamens.
 * Nutzt eine einfache Google-Suche über den HTML-Scraping-Ansatz.
 */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Sucht die Website eines Unternehmens via DuckDuckGo (kein API-Key nötig) */
export async function findCompanyWebsite(companyName: string, city?: string | null): Promise<string | null> {
  const query = city
    ? `${companyName} ${city} website`
    : `${companyName} website impressum`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    // DuckDuckGo HTML-Suche
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();

    // Ergebnis-URLs extrahieren — DuckDuckGo HTML hat Links in class="result__url"
    const urlMatches = html.match(/class="result__url"[^>]*>([^<]+)</g);
    if (!urlMatches || urlMatches.length === 0) {
      // Fallback: URLs aus href-Attributen
      const hrefMatches = html.match(/href="\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)/g);
      if (hrefMatches && hrefMatches.length > 0) {
        const encoded = hrefMatches[0].match(/uddg=([^&"]+)/)?.[1];
        if (encoded) {
          const decoded = decodeURIComponent(encoded);
          return extractDomain(decoded);
        }
      }
      return null;
    }

    // Erste relevante URL finden (keine Social Media, keine Verzeichnisse)
    const skipDomains = [
      "facebook.com", "linkedin.com", "xing.com", "twitter.com", "instagram.com",
      "youtube.com", "wikipedia.org", "yelp.de", "gelbeseiten.de", "11880.com",
      "golocal.de", "kununu.com", "glassdoor.de", "indeed.de",
    ];

    for (const match of urlMatches) {
      const urlText = match.replace(/class="result__url"[^>]*>/, "").trim();
      const cleanUrl = urlText.startsWith("http") ? urlText : `https://${urlText}`;

      try {
        const parsedUrl = new URL(cleanUrl);
        const domain = parsedUrl.hostname.replace(/^www\./, "");

        if (skipDomains.some((skip) => domain.includes(skip))) continue;

        // Prüfen ob die Domain dem Firmennamen ähnelt
        const normalizedName = companyName.toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .replace(/(gmbh|ag|ug|kg|ohg|se|mbh|co)/g, "");

        const normalizedDomain = domain.split(".")[0]
          .replace(/[^a-z0-9]/g, "");

        // Wenn Domain den Firmennamen enthält oder umgekehrt → gut
        if (normalizedDomain.includes(normalizedName.slice(0, 5)) ||
            normalizedName.includes(normalizedDomain.slice(0, 5))) {
          return domain;
        }

        // Erstes nicht-Social-Media Ergebnis als Fallback
        return domain;
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
