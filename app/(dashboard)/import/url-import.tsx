"use client";

import { useState, useTransition } from "react";
import { Globe, Loader2, ExternalLink, Check } from "lucide-react";
import { importFromUrl } from "./url-actions";

export function UrlImport() {
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    leadId?: string;
    companyName?: string;
    error?: string;
  } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setResult(null);
    startTransition(async () => {
      const res = await importFromUrl(url.trim());
      setResult(res);
      if (res.success) setUrl("");
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
      <h3 className="flex items-center gap-2 font-medium">
        <Globe className="h-4 w-4 text-primary" />
        Einzelne Firmen-URL importieren
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Geben Sie die Website-URL eines Unternehmens ein. Das Unternehmen wird importiert und automatisch angereichert (Kontakte, Stellenanzeigen, etc.).
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Firmen-URL
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="z.B. https://musterfirma.de"
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importiere…
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" />
              Importieren & Anreichern
            </>
          )}
        </button>
      </form>

      {isPending && (
        <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
          Webseite wird geladen, Daten werden extrahiert und Lead wird erstellt. Dies kann bis zu 30 Sekunden dauern…
        </div>
      )}

      {result && !isPending && (
        <>
          {result.success ? (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                <Check className="h-4 w-4" />
                Lead &quot;{result.companyName}&quot; erfolgreich importiert und angereichert.
              </div>
              <a
                href={`/leads/${result.leadId}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Lead öffnen
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {result.error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
