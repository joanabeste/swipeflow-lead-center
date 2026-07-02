import type { ActivityKind } from "./types";

export function actionVerb(kind: ActivityKind): string {
  switch (kind) {
    case "note": return "hat eine Notiz hinzugefügt";
    case "call": return "hat einen Anruf protokolliert";
    case "email": return "hat eine E-Mail gesendet";
    case "status": return "hat den Status geändert";
    case "enrichment": return "Lead wurde angereichert";
    case "change": return "hat ein Feld aktualisiert";
    case "import": return "Lead importiert";
    case "appointment": return "Calendly-Termin";
    default: return "";
  }
}

/** Lesbares Label für die Lead-Herkunft (Import-Typ) — granular vor grob. */
export function importSourceLabel(importType: string | null, sourceType: string | null): string {
  const t = importType ?? sourceType;
  switch (t) {
    case "google_maps": return "Google Maps";
    case "instant_scraper": return "Instant Data Scraper";
    case "ba_job_listing": return "Bundesagentur-Stellenanzeigen";
    case "csv": return "CSV-Upload";
    case "url": return "Einzel-URL";
    case "directory": return "Verzeichnis-Import";
    case "api": return "API";
    case "manual": return "Manuell angelegt";
    default: return t ?? "Unbekannte Quelle";
  }
}

export function filterLabel(kind: ActivityKind): string {
  switch (kind) {
    case "note": return "Notizen";
    case "call": return "Anrufe";
    case "email": return "E-Mails";
    case "status": return "Status-Änderungen";
    case "enrichment": return "Anreicherungen";
    case "change": return "Änderungen";
    case "import": return "Import";
    case "appointment": return "Termine";
    default: return "Aktivitäten";
  }
}

export function formatDur(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

export function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `vor ${m} Min`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `vor ${h} Std`;
  }
  if (diff < 7 * 86400) {
    const d = Math.floor(diff / 86400);
    return `vor ${d} ${d === 1 ? "Tag" : "Tagen"}`;
  }
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}
