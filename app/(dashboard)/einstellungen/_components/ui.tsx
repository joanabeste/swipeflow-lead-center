import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e] ${className}`}>
      {children}
    </div>
  );
}

export function FormStatus({ state }: { state?: { error?: string; success?: boolean } }) {
  if (!state) return null;
  if (state.error) {
    return (
      <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
        {state.error}
      </div>
    );
  }
  if (state.success) {
    return (
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
        <Check className="h-3.5 w-3.5" />
        Gespeichert
      </div>
    );
  }
  return null;
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
    >
      {pending ? "Speichern…" : children}
    </button>
  );
}

export function PageHeader({
  icon: Icon,
  category,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  category: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-6 border-b border-gray-200 pb-5 dark:border-[#2c2c2e]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {category}
      </p>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      {subtitle && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </header>
  );
}
