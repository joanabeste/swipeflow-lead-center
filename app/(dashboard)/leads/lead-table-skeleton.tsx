/**
 * Tabellen-Skeleton als Suspense-Fallback für die Lead-Liste. Bildet die
 * Toolbar + Tabellenstruktur nach (Kopfzeile + ~10 Platzhalterzeilen), damit
 * beim Streaming kein Layout-Sprung entsteht und die wahrgenommene Wartezeit
 * sinkt. Animation kommt über `animate-pulse` (Tailwind).
 */
export function LeadTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="mt-4 animate-pulse space-y-4">
      {/* Subtitle-Platzhalter (Anzahl Leads) */}
      <div className="h-4 w-48 rounded bg-gray-100 dark:bg-white/5" />

      {/* Toolbar: Suche + Filter + Spaltenauswahl */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-72 rounded-md bg-gray-200 dark:bg-white/5" />
        <div className="h-9 w-36 rounded-md bg-gray-100 dark:bg-white/5" />
        <div className="h-9 w-36 rounded-md bg-gray-100 dark:bg-white/5" />
        <div className="ml-auto h-9 w-28 rounded-md bg-gray-100 dark:bg-white/5" />
      </div>

      {/* Tabelle */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-[#2c2c2e]/50">
        {/* Kopfzeile */}
        <div className="flex items-center gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 flex-1 rounded bg-gray-200 dark:bg-white/5" />
          ))}
        </div>
        {/* Zeilen */}
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-0 dark:border-[#2c2c2e]/30"
          >
            {Array.from({ length: 6 }).map((_, c) => (
              <div key={c} className="h-4 flex-1 rounded bg-gray-100 dark:bg-white/5" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
