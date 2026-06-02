"use client";

import { useState, useTransition } from "react";
import { Link2, Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";
import type { LeadLink } from "@/lib/types";
import { usePreviewRefresh } from "@/lib/preview-refresh-context";
import { addLeadLink, deleteLeadLink } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import { linkTypeLabel, linkTypeBadgeClass } from "@/lib/leads/link-platforms";
import { Card } from "./crm-shared";

/**
 * Zeigt zusätzliche Webseiten/Profile eines Leads (Facebook, Instagram, …) und
 * erlaubt Hinzufügen/Löschen. Plattform wird serverseitig aus der URL erkannt;
 * Anzeige als Text-Badge (keine Marken-Icons — lucide v1 hat sie nicht).
 */
export function CrmLinksCard({ leadId, links }: { leadId: string; links: LeadLink[] }) {
  const notify = usePreviewRefresh();
  const { addToast } = useToastContext();
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    const u = url.trim();
    if (!u) return;
    startTransition(async () => {
      const res = await addLeadLink(leadId, u, { label: label.trim() || null });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      setUrl("");
      setLabel("");
      setAdding(false);
      notify();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Diesen Link entfernen?")) return;
    startTransition(async () => {
      const res = await deleteLeadLink(id, leadId);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      notify();
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Link2 className="h-3.5 w-3.5" />
          Profile &amp; Links
        </h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Hinzufügen
          </button>
        )}
      </div>

      {links.length === 0 && !adding && (
        <p className="mt-2 text-xs text-gray-400">Noch keine Profile/Links.</p>
      )}

      {links.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {links.map((l) => (
            <li
              key={l.id}
              className="group flex items-center justify-between gap-2 rounded-md border border-gray-100 px-2 py-1.5 dark:border-[#2c2c2e]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${linkTypeBadgeClass(l.type)}`}>
                  {linkTypeLabel(l.type)}
                </span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  title={l.url}
                  className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-primary hover:underline"
                >
                  <span className="truncate">{l.label || l.url}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <button
                onClick={() => handleDelete(l.id)}
                disabled={pending}
                title="Link entfernen"
                className="shrink-0 rounded p-1 text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 space-y-1.5">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
            placeholder="https://facebook.com/firma"
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleAdd}
              disabled={pending || !url.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-gray-900 hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Hinzufügen
            </button>
            <button
              onClick={() => { setAdding(false); setUrl(""); setLabel(""); }}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
