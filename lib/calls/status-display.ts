import type { CallStatus } from "@/lib/types";

/** Anzeige-Metadaten je Anruf-Status: deutsches Label, Badge-Klassen (Hell/Dunkel)
 *  und eine Punkt-Farbe für Mini-Balken/Legenden. Eine Quelle der Wahrheit für
 *  Auto-Dialer (LastCallStatusPill) und Dashboard-Karten. */
export interface CallStatusDisplay {
  label: string;
  /** Tailwind-Klassen für die Status-Pille (inkl. Dark-Mode). */
  cls: string;
  /** Hintergrundfarbe für einen Punkt/Balken (Tailwind bg-*). */
  dot: string;
}

export const CALL_STATUS_DISPLAY: Record<CallStatus, CallStatusDisplay> = {
  initiated: { label: "gewählt", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-400" },
  ringing: { label: "klingelt", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", dot: "bg-blue-400" },
  answered: { label: "angenommen", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  missed: { label: "verpasst", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-400" },
  failed: { label: "fehlgeschlagen", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-400" },
  ended: { label: "beendet", cls: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400", dot: "bg-gray-400" },
};

const FALLBACK: CallStatusDisplay = {
  label: "unbekannt",
  cls: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
  dot: "bg-gray-400",
};

/** Robuster Lookup: liefert für unbekannte Status einen neutralen Fallback,
 *  der das Roh-Label durchreicht. */
export function callStatusDisplay(status: string): CallStatusDisplay {
  return CALL_STATUS_DISPLAY[status as CallStatus] ?? { ...FALLBACK, label: status };
}

/** Sinnvolle Sortier-/Anzeigereihenfolge für Status-Aufschlüsselungen. */
export const CALL_STATUS_ORDER: CallStatus[] = [
  "answered", "ended", "ringing", "initiated", "missed", "failed",
];
