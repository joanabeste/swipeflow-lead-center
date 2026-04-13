/**
 * Erkennt automatisch das Format einer CSV-Datei anhand der Header.
 */

export type CsvFormat = "job_listing" | "google_maps" | "standard";

export interface FormatDetectionResult {
  format: CsvFormat;
  label: string;
  description: string;
}

/** Erkennt das CSV-Format anhand der Header-Zeile und der ersten Datenzeilen */
export function detectCsvFormat(
  headers: string[],
  firstRows: string[][] = [],
): FormatDetectionResult {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  // BA Stellenanzeigen: "Kontakt" + "Stelle" + "Beschreibung"
  if (
    lowerHeaders.some((h) => h === "kontakt") &&
    lowerHeaders.some((h) => h === "stelle") &&
    lowerHeaders.some((h) => h === "beschreibung")
  ) {
    return {
      format: "job_listing",
      label: "BA Stellenanzeigen",
      description: "Stellenanzeigen der Bundesagentur für Arbeit mit Ansprechpartnern und Kontaktdaten",
    };
  }

  // Google Maps: Kryptische Header wie "qBF1Pd" ODER Google Maps URLs in den Daten
  if (
    lowerHeaders.some((h) => h === "qbf1pd" || h === "mw4etd") ||
    firstRows.some((row) =>
      row.some((cell) => cell.includes("google.com/maps/place"))
    )
  ) {
    return {
      format: "google_maps",
      label: "Google Maps",
      description: "Firmendaten aus Google Maps mit Bewertungen, Telefon und Website",
    };
  }

  // Standard CSV
  return {
    format: "standard",
    label: "Firmendaten",
    description: "Standard CSV mit Firmen- und Kontaktdaten",
  };
}

/** Google Maps Spalten-Mapping (Position-basiert, da Header kryptisch sind) */
export const GOOGLE_MAPS_COLUMNS = {
  mapsUrl: 0,      // hfpxzc href
  companyName: 1,   // qBF1Pd
  rating: 2,        // MW4etd
  reviewCount: 3,   // UY7F9
  category: 4,      // W4Efsd (Branche)
  address: 6,       // W4Efsd 3 (Straße)
  phone: 10,        // UsdlK
  website: 11,      // lcr4fd href
  review: 17,       // ah5Ghc (Bewertungstext)
};
