"use client";

import { useState } from "react";
import { StickyNote, Plus } from "lucide-react";
import type { LeadNoteWithDetails } from "@/lib/types";
import { usePreviewRefresh } from "@/lib/preview-refresh-context";
import { ComposeNote } from "../../crm/[id]/_components/compose-note";
import { NoteItem } from "../../crm/[id]/_components/activity-items";
import { PersonAvatar } from "../../crm/[id]/_components/person-avatar";
import { actionVerb, formatRelative } from "../../crm/[id]/_components/activity-helpers";

/**
 * Notiz-Karte für die Neue-Leads-Detailansicht (Vollseite + Vorschau-Drawer).
 * Wiederverwendet die CRM-Notiz-Bausteine (ComposeNote/NoteItem), aber nur für
 * Notizen — ohne Anrufe/E-Mails/CRM-Status. Der Lead wird dadurch nicht verschoben.
 */
export function LeadNotesCard({
  leadId,
  notes,
}: {
  leadId: string;
  notes: LeadNoteWithDetails[];
}) {
  const notify = usePreviewRefresh();
  const [composing, setComposing] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between border-b border-gray-100 p-3 dark:border-[#2c2c2e]">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
          <StickyNote className="h-3.5 w-3.5" />
          Notizen ({notes.length})
        </h2>
        {!composing && (
          <button
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" />
            Neue Notiz
          </button>
        )}
      </div>

      {composing && (
        <ComposeNote
          leadId={leadId}
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false);
            notify();
          }}
        />
      )}

      <div className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
        {notes.length === 0 ? (
          !composing && (
            <p className="p-6 text-center text-sm text-gray-400">Noch keine Notizen.</p>
          )
        ) : (
          notes.map((n) => (
            <div key={n.id} className="flex gap-3 p-4">
              <div className="flex-shrink-0">
                <PersonAvatar name={n.profiles?.name ?? null} kind="note" avatarUrl={n.profiles?.avatar_url} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {n.profiles?.name ?? "System"}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400"> · {actionVerb("note")}</span>
                  <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                    · {formatRelative(n.created_at)}
                  </span>
                </p>
                <div className="mt-1">
                  <NoteItem note={n} leadId={leadId} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
