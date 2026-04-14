import type { ActivityKind } from "./types";

export function actionVerb(kind: ActivityKind): string {
  switch (kind) {
    case "note": return "hat eine Notiz hinzugefügt";
    case "call": return "hat einen Anruf protokolliert";
    case "status": return "hat den Status geändert";
    case "enrichment": return "Lead wurde angereichert";
    case "change": return "hat ein Feld aktualisiert";
    default: return "";
  }
}

export function filterLabel(kind: ActivityKind): string {
  switch (kind) {
    case "note": return "Notizen";
    case "call": return "Anrufe";
    case "status": return "Status-Änderungen";
    case "enrichment": return "Anreicherungen";
    case "change": return "Änderungen";
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
