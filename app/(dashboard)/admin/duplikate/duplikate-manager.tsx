"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Phone, GitMerge, Loader2, Check, ExternalLink } from "lucide-react";
import { mergeSelectedDuplicates } from "./actions";
import type { LeadForCluster } from "@/lib/leads/duplicate-clusters";

interface ClusterView {
  survivor: LeadForCluster;
  losers: LeadForCluster[];
}

/**
 * Duplikat-Bereinigung mit Auswahl: pro Verlierer-Lead (und pro Gruppe / global)
 * an-/abwählbar, dann „Ausgewählte zusammenführen". Wichtig, weil die automatische
 * Clusterung über eine geteilte Domain (z.B. Franchise-Portal) verschiedene Firmen
 * zusammenfassen kann — so kann der Admin Falsch-Treffer einfach abwählen.
 */
export function DuplikateManager({ clusters }: { clusters: ClusterView[] }) {
  const router = useRouter();
  const allLoserIds = useMemo(
    () => clusters.flatMap((c) => c.losers.map((l) => l.id)),
    [clusters],
  );
  // Standard: alles ausgewählt — der Admin wählt die Falsch-Treffer ab.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allLoserIds));
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ merged: number; losers: number; errors: number; errorMessage?: string } | null>(null);

  const totalLosers = allLoserIds.length;
  const selectedCount = selected.size;
  const allSelected = totalLosers > 0 && selectedCount === totalLosers;

  function toggleLoser(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function setGroup(cluster: ClusterView, on: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      for (const l of cluster.losers) {
        if (on) n.add(l.id);
        else n.delete(l.id);
      }
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allLoserIds));
  }

  function run() {
    setConfirming(false);
    const groups = clusters
      .map((c) => ({
        survivorId: c.survivor.id,
        losers: c.losers
          .filter((l) => selected.has(l.id))
          .map((l) => ({ id: l.id, company_name: l.company_name, website: l.website, city: l.city })),
      }))
      .filter((g) => g.losers.length > 0);
    if (groups.length === 0) return;
    startTransition(async () => {
      const res = await mergeSelectedDuplicates(groups);
      setResult(res);
      if (res.merged > 0) {
        // Erfolgreich zusammengeführte aus der lokalen Auswahl entfernen + Liste neu laden.
        router.refresh();
      }
    });
  }

  if (clusters.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <Copy className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Keine Duplikate gefunden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: Zähler + Alle-Auswahl + Zusammenführen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {clusters.length} Gruppen · {totalLosers} Duplikate · <span className="font-medium text-gray-700 dark:text-gray-200">{selectedCount} ausgewählt</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleAll}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {allSelected ? "Alle abwählen" : "Alle auswählen"}
          </button>
          {confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-300">{selectedCount} zusammenführen?</span>
              <button onClick={run} className="rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-gray-900 hover:bg-primary/90">
                Ja
              </button>
              <button onClick={() => setConfirming(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                Abbrechen
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={pending || selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-gray-900 hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              Ausgewählte zusammenführen ({selectedCount})
            </button>
          )}
        </div>
      </div>

      {result && (
        result.merged === 0 && result.errors > 0 ? (
          <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            <p className="font-medium">Zusammenführen fehlgeschlagen ({result.errors} Fehler).</p>
            {result.errorMessage && <p className="mt-1 font-mono text-xs">{result.errorMessage}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            <Check className="h-4 w-4" />
            {result.merged} Gruppen zusammengeführt ({result.losers} Duplikate archiviert)
            {result.errors > 0 ? `, ${result.errors} Fehler` : ""}.
          </div>
        )
      )}

      <div className="space-y-4">
        {clusters.map((c) => {
          const selInGroup = c.losers.filter((l) => selected.has(l.id)).length;
          const groupAll = selInGroup === c.losers.length;
          return (
            <div
              key={c.survivor.id}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
            >
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-[#2c2c2e]/40">
                <div className="min-w-0">
                  <span className="text-xs font-medium uppercase tracking-wider text-green-600 dark:text-green-400">
                    Behalten
                  </span>
                  <LeadLine lead={c.survivor} />
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={groupAll}
                    ref={(el) => { if (el) el.indeterminate = selInGroup > 0 && !groupAll; }}
                    onChange={(e) => setGroup(c, e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Gruppe
                </label>
              </div>
              <div className="divide-y divide-gray-100 px-4 dark:divide-[#2c2c2e]/40">
                {c.losers.map((l) => {
                  const on = selected.has(l.id);
                  return (
                    <div key={l.id} className={`flex items-start gap-3 py-2 ${on ? "" : "opacity-50"}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleLoser(l.id)}
                        className="mt-1 h-3.5 w-3.5 shrink-0 accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <span className={`text-xs font-medium uppercase tracking-wider ${on ? "text-gray-400" : "text-gray-400 line-through"}`}>
                          {on ? "Wird zusammengeführt" : "Nicht zusammenführen"}
                        </span>
                        <LeadLine lead={l} />
                      </div>
                      <a
                        href={`/crm/${l.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="In neuem Tab öffnen"
                        aria-label="In neuem Tab öffnen"
                        className="mt-0.5 shrink-0 rounded-md border border-gray-200 p-1 text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-[#2c2c2e] dark:text-gray-400 dark:hover:bg-white/5"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadLine({
  lead,
}: {
  lead: { company_name: string | null; website: string | null; city: string | null; activity: number };
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="font-medium text-gray-900 dark:text-white">{lead.company_name ?? "—"}</span>
      {lead.website && <span className="text-gray-500 dark:text-gray-400">{lead.website}</span>}
      {lead.city && <span className="text-gray-400">{lead.city}</span>}
      {lead.activity > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
          <Phone className="h-3 w-3" />
          {lead.activity}
        </span>
      )}
    </div>
  );
}
