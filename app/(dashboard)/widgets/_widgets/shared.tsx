export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // h-full default: damit Widgets, die nebeneinander im selben Grid-Row stehen,
  // automatisch dieselbe Höhe haben (CSS-Grid stretcht die Zelle, nur der
  // Widget-Inhalt muss dann auch ausfüllen).
  return (
    <div className={`h-full rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] ${className}`}>
      {children}
    </div>
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export function weekdayShort(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("de-DE", { weekday: "short" });
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
