/**
 * Browser-Prefetch fuer Preview-Drawer-Daten.
 *
 * Wird beim Hover auf Tabellen-Zeilen (lead-table, crm-manager) und beim Oeffnen
 * des Drawers fuer Nachbarn aufgerufen. Der Browser legt die Antwort in seinen
 * HTTP-Cache (siehe Cache-Control auf /api/leads/[id]/preview), sodass ein
 * folgender echter Klick instant aufgeloest wird.
 *
 * Inflight-Dedup verhindert dass derselbe Lead bei mehrfachem Hover zigfach
 * gefetcht wird. Keine Promise-Map noetig — der Browser-Cache uebernimmt die
 * Deduplizierung sobald die erste Antwort da ist.
 */

const inflight = new Set<string>();

export type PreviewKind = "leads" | "crm";

function key(kind: PreviewKind, id: string): string {
  return `${kind}:${id}`;
}

export function prefetchPreview(id: string, kind: PreviewKind = "leads"): void {
  if (typeof window === "undefined") return;
  const k = key(kind, id);
  if (inflight.has(k)) return;
  inflight.add(k);
  fetch(`/api/${kind}/${id}/preview`, { credentials: "same-origin" })
    .catch(() => {})
    .finally(() => inflight.delete(k));
}

/** Prefetcht eine kleine Nachbarschaft (±2) um den aktuellen Lead. Wird beim
 *  Oeffnen des Drawers aufgerufen, damit Prev/Next-Klicks ohne Wartezeit
 *  funktionieren. */
export function prefetchNeighbors(
  siblingIds: string[],
  currentId: string,
  kind: PreviewKind = "leads",
  radius = 2,
): void {
  if (typeof window === "undefined") return;
  const idx = siblingIds.indexOf(currentId);
  if (idx < 0) return;
  const schedule = (cb: () => void) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(cb);
    else setTimeout(cb, 50);
  };
  schedule(() => {
    for (let d = 1; d <= radius; d++) {
      const before = siblingIds[idx - d];
      const after = siblingIds[idx + d];
      if (before) prefetchPreview(before, kind);
      if (after) prefetchPreview(after, kind);
    }
  });
}
