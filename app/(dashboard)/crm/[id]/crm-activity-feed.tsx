"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StickyNote, PhoneCall } from "lucide-react";
import type { CustomLeadStatus, LeadContact, LeadEnrichment, LeadChange } from "@/lib/types";
import { updateCrmStatus } from "../actions";
import { PersonAvatar } from "./_components/person-avatar";
import { NoteItem, CallItem, StatusChangeItem, EnrichmentItem, ChangeItem } from "./_components/activity-items";
import { ComposeNote } from "./_components/compose-note";
import { ComposeCall } from "./_components/compose-call";
import { actionVerb, filterLabel, formatRelative } from "./_components/activity-helpers";
import type { ActivityKind, NoteRow, CallRow, AuditRow } from "./_components/types";

interface Props {
  leadId: string;
  leadPhone: string | null;
  currentStatusId: string | null;
  statuses: CustomLeadStatus[];
  contacts: LeadContact[];
  notes: NoteRow[];
  calls: CallRow[];
  enrichments: LeadEnrichment[];
  changes: LeadChange[];
  auditLogs: AuditRow[];
  callProviders: { phonemondo: boolean; webex: boolean };
}

interface UnifiedItem {
  id: string;
  kind: ActivityKind;
  at: string;
  author: string | null;
  authorAvatarUrl: string | null;
  render: () => React.ReactNode;
}

export function CrmActivityFeed({
  leadId, leadPhone, currentStatusId, statuses, contacts, notes, calls, enrichments, changes, auditLogs, callProviders,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<ActivityKind>("all");
  // Standardmäßig ist der Anruf-Bereich aufgeklappt, weil das die häufigste
  // Aktion im CRM-Detail ist.
  const [composeMode, setComposeMode] = useState<"idle" | "note" | "call">("call");
  const [pending, startTransition] = useTransition();
  const activeStatuses = statuses.filter((s) => s.is_active);

  function handleStatusChange(statusId: string) {
    startTransition(async () => {
      await updateCrmStatus(leadId, statusId || null);
      router.refresh();
    });
  }

  const items: UnifiedItem[] = [];
  for (const n of notes) {
    items.push({
      id: `n-${n.id}`, kind: "note", at: n.created_at,
      author: n.profiles?.name ?? null,
      authorAvatarUrl: n.profiles?.avatar_url ?? null,
      render: () => <NoteItem note={n} leadId={leadId} />,
    });
  }
  for (const c of calls) {
    items.push({
      id: `c-${c.id}`, kind: "call", at: c.started_at,
      author: c.profiles?.name ?? null,
      authorAvatarUrl: c.profiles?.avatar_url ?? null,
      render: () => <CallItem call={c} />,
    });
  }
  for (const e of enrichments) {
    if (!e.completed_at) continue;
    items.push({
      id: `e-${e.id}`, kind: "enrichment", at: e.completed_at,
      author: null,
      authorAvatarUrl: null,
      render: () => <EnrichmentItem enrichment={e} />,
    });
  }
  for (const log of auditLogs) {
    if (log.action === "lead.crm_status_changed") {
      items.push({
        id: `a-${log.id}`, kind: "status", at: log.created_at,
        author: log.profiles?.name ?? null,
        authorAvatarUrl: log.profiles?.avatar_url ?? null,
        render: () => <StatusChangeItem log={log} statuses={statuses} kind="crm" />,
      });
    } else if (log.action === "lead.bulk_status_update") {
      items.push({
        id: `a-${log.id}`, kind: "status", at: log.created_at,
        author: log.profiles?.name ?? null,
        authorAvatarUrl: log.profiles?.avatar_url ?? null,
        render: () => <StatusChangeItem log={log} statuses={statuses} kind="pipeline" />,
      });
    }
  }
  for (const ch of changes) {
    items.push({
      id: `ch-${ch.id}`, kind: "change", at: ch.created_at,
      author: null,
      authorAvatarUrl: null,
      render: () => <ChangeItem change={ch} />,
    });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3 dark:border-[#2c2c2e]">
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={PhoneCall}
            label="Anruf"
            active={composeMode === "call"}
            onClick={() => setComposeMode(composeMode === "call" ? "idle" : "call")}
          />
          <ToolbarButton
            icon={StickyNote}
            label="Notiz"
            active={composeMode === "note"}
            onClick={() => setComposeMode(composeMode === "note" ? "idle" : "note")}
          />
        </div>

        <div className="mx-1 h-5 w-px bg-gray-200 dark:bg-[#2c2c2e]" />

        <label className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-gray-500 dark:text-gray-400">Anzeigen:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ActivityKind)}
            className={`rounded-md border px-2 py-1 text-xs ${
              filter !== "all"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
            }`}
          >
            <option value="all">Alle Aktivitäten</option>
            <option value="note">Nur Notizen</option>
            <option value="call">Nur Anrufe</option>
            <option value="status">Nur Status-Wechsel</option>
            <option value="enrichment">Nur Anreicherung</option>
            <option value="change">Nur Feld-Änderungen</option>
          </select>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">CRM-Status:</span>
          <select
            value={currentStatusId ?? ""}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={pending}
            className="rounded-full px-3 py-1 text-xs font-medium focus:ring-2 focus:ring-primary focus:outline-none"
            style={(() => {
              const s = statuses.find((x) => x.id === currentStatusId);
              return s
                ? { backgroundColor: `${s.color}20`, color: s.color }
                : { backgroundColor: "#f3f4f6", color: "#6b7280" };
            })()}
          >
            <option value="">— kein Status —</option>
            {activeStatuses.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {composeMode === "note" && (
        <ComposeNote
          leadId={leadId}
          onClose={() => setComposeMode("idle")}
          onSaved={() => { setComposeMode("idle"); router.refresh(); }}
        />
      )}
      {composeMode === "call" && (
        <ComposeCall
          leadId={leadId}
          leadPhone={leadPhone}
          contacts={contacts}
          callProviders={callProviders}
          onClose={() => setComposeMode("idle")}
          onSaved={() => { setComposeMode("idle"); router.refresh(); }}
        />
      )}

      <div className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Keine {filter === "all" ? "Aktivitäten" : filterLabel(filter)} vorhanden.
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="flex gap-3 p-4 hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
              <div className="flex-shrink-0">
                <PersonAvatar name={item.author} kind={item.kind} avatarUrl={item.authorAvatarUrl} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {item.author ?? "System"}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400"> · {actionVerb(item.kind)}</span>
                  <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                    · {formatRelative(item.at)}
                  </span>
                </p>
                <div className="mt-1">{item.render()}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon, label, active, onClick,
}: { icon: React.ComponentType<{ className?: string }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-primary text-gray-900"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
