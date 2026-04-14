"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold">Etwas ist schiefgelaufen</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Ein unerwarteter Fehler ist aufgetreten. Lade die Seite neu oder gehe zurück zur Übersicht.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] text-gray-400">Digest: {error.digest}</p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nochmal versuchen
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
          >
            <Home className="h-3.5 w-3.5" />
            Übersicht
          </Link>
        </div>
      </div>
    </div>
  );
}
