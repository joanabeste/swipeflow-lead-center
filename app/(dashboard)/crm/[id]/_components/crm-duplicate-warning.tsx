"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { mergeDuplicateLead } from "../../../leads/actions";
import type { DuplicateCandidate } from "@/lib/leads/find-existing";

// Klartext-Begründung, warum ein Lead als mögliches Duplikat gilt.
const MATCH_LABEL: Record<DuplicateCandidate["matchedOn"], string> = {
  domain: "gleiche Domain",
  email: "gleiche E-Mail",
  phone: "gleiche Telefonnummer",
  name: "ähnlicher Name",
};

/**
 * Warnbanner im CRM-Lead-Detail: zeigt mutmaßliche Duplikate dieses Leads und
 * erlaubt das Zusammenführen direkt von hier. Die Kandidaten werden serverseitig
 * pro Seitenaufruf ermittelt (siehe findLeadDuplicates) — also auch nach dem
 * Anreichern frisch, falls dort z.B. erst die Domain bekannt wurde.
 *
 * Merge-Semantik: der angesehene Lead (`leadId`) bleibt erhalten, das Duplikat
 * wird über die sichere `merge_lead`-RPC umgehängt + archiviert.
 */
export function CrmDuplicateWarning({
  leadId,
  candidates,
}: {
  leadId: string;
  candidates: DuplicateCandidate[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<DuplicateCandidate[]>(candidates);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  function handleMerge(loserId: string, name: string | null) {
    if (
      !confirm(
        `„${name ?? "Lead"}“ in diesen Lead zusammenführen?\n\nAnrufe, Verträge, Deals & Notizen wandern hierher, das Duplikat wird archiviert (umkehrbar).`,
      )
    ) {
      return;
    }
    setError(null);
    setMergingId(loserId);
    startTransition(async () => {
      const res = await mergeDuplicateLead(leadId, loserId);
      setMergingId(null);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setItems((prev) => prev.filter((c) => c.id !== loserId));
      router.refresh();
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
      <Copy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          {items.length === 1
            ? "Mögliches Duplikat gefunden"
            : `${items.length} mögliche Duplikate gefunden`}
        </p>
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
          Dieser Lead ähnelt {items.length === 1 ? "einem anderen Lead" : "anderen Leads"}.
          Beim Zusammenführen bleibt dieser Lead erhalten, das Duplikat wird archiviert.
        </p>

        <div className="mt-2 space-y-1.5">
          {items.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white/60 px-2.5 py-1.5 dark:border-amber-900/40 dark:bg-black/10"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {c.company_name ?? "—"}
                  </p>
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {MATCH_LABEL[c.matchedOn]}
                  </span>
                </div>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {[c.website, c.city].filter(Boolean).join(" · ") || "–"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <a
                  href={`/crm/${c.id}`}
                  className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  Ansehen
                </a>
                <button
                  onClick={() => handleMerge(c.id, c.company_name)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending && mergingId === c.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  Zusammenführen
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
