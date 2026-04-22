/** Wiederverwendbarer Skeleton für Seiten-Inhalte: Header + 3 Kacheln.
 *  Bewusst keine Animation hier — `animate-pulse` macht Tailwind. */
export function SectionSkeleton({ title }: { title?: string }) {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gray-200 dark:bg-white/5" />
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-gray-200 dark:bg-white/5" />
          {title && <div className="h-3 w-64 rounded bg-gray-100 dark:bg-white/5" />}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="h-24 rounded-2xl bg-gray-100 dark:bg-white/5" />
        <div className="h-24 rounded-2xl bg-gray-100 dark:bg-white/5" />
        <div className="h-24 rounded-2xl bg-gray-100 dark:bg-white/5" />
      </div>
      <div className="h-64 rounded-2xl border border-gray-200 bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-white/[0.02]" />
    </div>
  );
}
