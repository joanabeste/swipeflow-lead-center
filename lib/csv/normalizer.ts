/** Normalisiert deutsche Telefonnummern */
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  // Excel-Apostroph-Prefix ('+49… oder '0…) und andere Nicht-Ziffern/+ am Anfang entfernen,
  // bevor Format-Logik läuft.
  let phone = raw.trim().replace(/^['`´]+/, "");
  phone = phone.replace(/[\s\-\(\)\/]/g, "");

  // Inlandsnummer (0…) und internationale Wählform (00…) auf die +-Form bringen,
  // damit Dedup format-unabhängig matcht:
  //   0571…     → +49571…   (deutsche Inlandsnummer)
  //   0049571…  → +49571…   (00 + Ländercode 49)
  //   001…      → +1…       (sonstige Länder)
  // Reihenfolge wichtig: 00 zuerst prüfen, sonst würde der Inlands-Zweig „0049…"
  // zu „+49049…" verstümmeln.
  if (phone.startsWith("00")) {
    phone = "+" + phone.slice(2);
  } else if (phone.startsWith("0")) {
    phone = "+49" + phone.slice(1);
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

  // Website immer als nackte Domain speichern — falls der CSV-User eine volle URL
  // eingetragen hat (https://www.foo.de/bla), wird der Hostname extrahiert.
  if (normalized.website) {
    normalized.website = extractDomain(normalized.website);
  }
  // Fallback: aus E-Mail extrahieren wenn keine Website hinterlegt
  if (!normalized.website) {
    normalized.website = extractDomain(normalized.email) ?? null;
  }

  // Default-Land
  if (!normalized.country) normalized.country = "Deutschland";

  return normalized;
}
