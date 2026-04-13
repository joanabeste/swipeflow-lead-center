/** Normalisiert deutsche Telefonnummern */
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let phone = raw.replace(/[\s\-\(\)\/]/g, "");

  // Deutsche Nummern: 0xxx -> +49xxx
  if (phone.startsWith("0") && !phone.startsWith("00")) {
    phone = "+49" + phone.slice(1);
  }
  if (phone.startsWith("0049")) {
    phone = "+49" + phone.slice(4);
  }

  return phone || null;
}

/** Validiert und normalisiert eine E-Mail-Adresse */
export function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? email : null;
}

/** Normalisiert eine URL */
export function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  let url = raw.trim();
  if (!url) return null;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

/** Extrahiert die Domain aus einer URL oder E-Mail */
export function extractDomain(urlOrEmail: string | null): string | null {
  if (!urlOrEmail) return null;

  // Aus E-Mail
  if (urlOrEmail.includes("@")) {
    return urlOrEmail.split("@")[1]?.toLowerCase() ?? null;
  }

  // Aus URL
  try {
    const url = urlOrEmail.startsWith("http")
      ? urlOrEmail
      : "https://" + urlOrEmail;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Normalisiert einen einzelnen Lead-Datensatz */
export function normalizeLeadRow(
  row: Record<string, string | null>,
): Record<string, string | null> {
  const normalized: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(row)) {
    // Trim und leere Strings zu null
    const trimmed = value?.trim() || null;
    normalized[key] = trimmed;
  }

  // Spezifische Normalisierungen
  if (normalized.phone) normalized.phone = normalizePhone(normalized.phone);
  if (normalized.email) normalized.email = normalizeEmail(normalized.email);
  if (normalized.website) normalized.website = normalizeUrl(normalized.website);

  // Domain extrahieren falls nicht vorhanden
  if (!normalized.domain) {
    normalized.domain =
      extractDomain(normalized.website) ??
      extractDomain(normalized.email) ??
      null;
  }

  // Default-Land
  if (!normalized.country) normalized.country = "Deutschland";

  return normalized;
}
