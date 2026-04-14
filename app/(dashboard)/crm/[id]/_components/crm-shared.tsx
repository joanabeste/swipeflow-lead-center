export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      {children}
    </div>
  );
}

export function Row({
  icon: Icon, value,
}: { icon: React.ComponentType<{ className?: string }>; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );
}
