// Portiert aus Swipeflow Time Tracking — gleiche Mappings, gleiche Logik.

export function describeZeitError(err: unknown): string {
  if (!err) return "Unbekannter Fehler.";
  if (err instanceof Error) return translateMessage(err.message) || err.name || "Unbekannter Fehler.";
  if (typeof err === "object" && err !== null) {
    const e = err as { message?: unknown; code?: unknown; status?: unknown };
    if (typeof e.message === "string" && e.message) return translateMessage(e.message);
    if (typeof e.code === "string" && e.code) return translateDbCode(e.code);
    if (typeof e.status === "number") {
      if (e.status === 403) return "Keine Berechtigung.";
      if (e.status === 401) return "Nicht angemeldet.";
      if (e.status === 429) return "Zu viele Anfragen — bitte kurz warten.";
      return `Fehler (HTTP ${e.status}).`;
    }
  }
  try {
    const json = JSON.stringify(err);
    return json && json !== "{}" ? json : "Unbekannter Fehler.";
  } catch {
    return "Unbekannter Fehler.";
  }
}

function translateMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("one_running_per_user") || m.includes("time_entries_one_running"))
    return "Es laeuft bereits ein Timer — bitte erst stoppen.";
  if (m.includes("violates check constraint")) return "Eingabe verletzt eine Regel (z.B. Ende vor Start).";
  if (m.includes("violates foreign key")) return "Verknuepfter Datensatz fehlt.";
  if (m.includes("duplicate key") || m.includes("already exists")) return "Eintrag existiert bereits.";
  if (m.includes("permission denied") || m.includes("not authorized"))
    return "Keine Berechtigung fuer diese Aktion.";
  if (/relation.*does not exist/i.test(raw) || m.includes("42p01"))
    return "Zeit-Modul nicht migriert — Migrationen 062–064 muessen in Supabase ausgefuehrt werden.";
  return raw;
}

function translateDbCode(code: string): string {
  if (code === "42P01") return "Zeit-Modul nicht migriert — Migrationen 062–064 muessen in Supabase ausgefuehrt werden.";
  if (code === "23505") return "Eintrag existiert bereits.";
  if (code === "23503") return "Verknuepfter Datensatz fehlt.";
  if (code === "23514") return "Eingabe verletzt eine Regel.";
  if (code === "42501") return "Keine Berechtigung fuer diese Aktion.";
  return `Datenbank-Fehler (${code}).`;
}
