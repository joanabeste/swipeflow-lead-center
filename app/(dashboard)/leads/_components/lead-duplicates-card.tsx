"use client";

import { useState, useTransition } from "react";
import { Merge } from "lucide-react";
import { findSimilarLeads, mergeLeads } from "../actions";

type SimilarLead = { id: string; company_name: string; domain: string | null; city: string | null; status: string };

export function LeadDuplicatesCard({ leadId }: { leadId: string }) {
  const [similar, setSimilar] = useState<SimilarLead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
          <Merge className="h-3.5 w-3.5" />
          Duplikate
        </h2>
        {!loaded && (
          <button
            onClick={async () => {
              const results = await findSimilarLeads(leadId);
              setSimilar(results);
              setLoaded(true);
            }}
            className="text-xs text-primary hover:underline"
          >
            Prüfen
          </button>
        )}
      </div>
      {loaded && similar.length === 0 && (
        <p className="mt-2 text-sm text-gray-400">Keine Duplikate gefunden.</p>
      )}
      {similar.length > 0 && (
        <div className="mt-2 space-y-2">
          {similar.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border border-gray-100 p-2 dark:border-[#2c2c2e]">
              <div>
                <p className="text-sm font-medium">{s.company_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.domain ?? s.city ?? "–"}</p>
              </div>
              <button
                onClick={() => {
                  if (confirm(`"${s.company_name}" in diesen Lead zusammenführen? Der andere Lead wird gelöscht.`)) {
                    startTransition(async () => {
                      await mergeLeads(leadId, s.id);
                      setSimilar((prev) => prev.filter((p) => p.id !== s.id));
                    });
                  }
                }}
                disabled={pending}
                className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                Zusammenführen
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
