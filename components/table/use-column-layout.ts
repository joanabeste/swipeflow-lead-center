"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveTablePrefs, resetTablePrefs } from "@/app/(dashboard)/_actions/table-prefs";
import type { ColumnPref, TableKey } from "@/lib/table-prefs";

const SAVE_DEBOUNCE_MS = 500;

export interface BaseColumn {
  key: string;
  label: string;
  defaultVisible: boolean;
}

export interface ResolvedColumn<T extends BaseColumn> {
  col: T;
  hidden: boolean;
  width: number | undefined;
}

interface Options<T extends BaseColumn> {
  tableKey: TableKey;
  /** Alle moeglichen Spalten dieser Tabelle (Reihenfolge = Default-Reihenfolge). */
  allColumns: T[];
  /** Vom Server geladene Praeferenzen — initialer State. */
  initialPrefs: ColumnPref[];
}

/**
 * Verschmilzt Server-Prefs mit den statischen Spalten-Defaults und liefert ein
 * konsistentes Layout-Objekt. Persistiert Aenderungen debounced an den Server.
 *
 * Reihenfolge: erst die Spalten aus prefs in der Prefs-Reihenfolge, dann die
 * fehlenden Spalten aus allColumns (Default-Reihenfolge ans Ende).
 * Sichtbarkeit: prefs.hidden gewinnt; ohne pref-Eintrag entscheidet defaultVisible.
 * Breite: prefs.width oder undefined (= Browser-Default).
 */
export function useColumnLayout<T extends BaseColumn>({
  tableKey, allColumns, initialPrefs,
}: Options<T>) {
  const [prefs, setPrefs] = useState<ColumnPref[]>(initialPrefs);

  const resolved: ResolvedColumn<T>[] = useMemo(() => {
    const allByKey = new Map(allColumns.map((c) => [c.key, c]));
    const prefsByKey = new Map(prefs.map((p) => [p.key, p]));
    const seen = new Set<string>();
    const ordered: ResolvedColumn<T>[] = [];

    // 1. Spalten in Prefs-Reihenfolge
    for (const p of prefs) {
      const col = allByKey.get(p.key);
      if (!col || seen.has(p.key)) continue;
      seen.add(p.key);
      ordered.push({
        col,
        hidden: p.hidden === true,
        width: p.width,
      });
    }
    // 2. Fehlende Spalten in Default-Reihenfolge anhaengen
    for (const col of allColumns) {
      if (seen.has(col.key)) continue;
      const p = prefsByKey.get(col.key);
      ordered.push({
        col,
        hidden: p?.hidden ?? !col.defaultVisible,
        width: p?.width,
      });
    }
    return ordered;
  }, [allColumns, prefs]);

  const visible: ResolvedColumn<T>[] = useMemo(
    () => resolved.filter((r) => !r.hidden),
    [resolved],
  );

  // Debounced save: jeder mutate-Call queued einen Save; letzter gewinnt.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedRef = useRef<ColumnPref[] | null>(null);

  const queueSave = useCallback((next: ColumnPref[]) => {
    queuedRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const payload = queuedRef.current;
      queuedRef.current = null;
      if (payload) void saveTablePrefs(tableKey, payload);
    }, SAVE_DEBOUNCE_MS);
  }, [tableKey]);

  // Cleanup-Timer beim Unmount, damit der pending Save nicht im "Hintergrund" verschwindet.
  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      const payload = queuedRef.current;
      if (payload) void saveTablePrefs(tableKey, payload);
    }
  }, [tableKey]);

  // Macht aus dem aktuellen resolved-Layout einen kompakten ColumnPref[]-State
  // — schreibt nur, was vom Default abweicht (Reihenfolge wird immer gespeichert,
  // damit Neuanordnung erhalten bleibt).
  const buildPrefs = useCallback((items: ResolvedColumn<T>[]): ColumnPref[] => {
    return items.map(({ col, hidden, width }) => {
      const out: ColumnPref = { key: col.key };
      if (typeof width === "number") out.width = width;
      if (hidden) out.hidden = true;
      return out;
    });
  }, []);

  const reorder = useCallback((activeKey: string, overKey: string) => {
    if (activeKey === overKey) return;
    setPrefs(() => {
      const fromIdx = resolved.findIndex((r) => r.col.key === activeKey);
      const toIdx = resolved.findIndex((r) => r.col.key === overKey);
      if (fromIdx === -1 || toIdx === -1) return prefs;
      const next = resolved.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const built = buildPrefs(next);
      queueSave(built);
      return built;
    });
  }, [resolved, prefs, buildPrefs, queueSave]);

  const setWidth = useCallback((key: string, width: number) => {
    setPrefs(() => {
      const next = resolved.map((r) =>
        r.col.key === key ? { ...r, width } : r,
      );
      const built = buildPrefs(next);
      queueSave(built);
      return built;
    });
  }, [resolved, buildPrefs, queueSave]);

  const toggleVisibility = useCallback((key: string) => {
    setPrefs(() => {
      const next = resolved.map((r) =>
        r.col.key === key ? { ...r, hidden: !r.hidden } : r,
      );
      const built = buildPrefs(next);
      queueSave(built);
      return built;
    });
  }, [resolved, buildPrefs, queueSave]);

  const reset = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    queuedRef.current = null;
    setPrefs([]);
    void resetTablePrefs(tableKey);
  }, [tableKey]);

  return { resolved, visible, reorder, setWidth, toggleVisibility, reset };
}
