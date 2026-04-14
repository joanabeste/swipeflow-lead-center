import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <Search className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold">Seite nicht gefunden</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Die angefragte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          <Home className="h-3.5 w-3.5" />
          Zur Übersicht
        </Link>
      </div>
    </div>
  );
}
