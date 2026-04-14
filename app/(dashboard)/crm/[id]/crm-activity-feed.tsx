"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  StickyNote, PhoneCall, Activity as ActivityIcon, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Sparkles, ArrowRight, Play, X,
} from "lucide-react";
import type {
  CustomLeadStatus, LeadContact, LeadNote, LeadCall, LeadEnrichment, LeadChange, CallDirection, CallStatus,
} from "@/lib/types";
import { Trash2, Pencil, Save, Check } from "lucide-react";
import { CrmStatusBadge } from "../status-badge";
import { addNote, deleteNote, logCall, startCall, updateCrmStatus, updateNote } from "../actions";
import { useToastContext } from "../../toast-provider";

type NoteRow = LeadNote & { profiles: { name: string } | null };
type CallRow = LeadCall & { profiles: { name: string } | null };
type AuditRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles: { name: string } | null;
};

export type ActivityKind = "all" | "note" | "call" | "status" | "enrichment" | "change";

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
}

interface UnifiedItem {
  id: string;
  kind: ActivityKind;
  at: string;
  author: string | null;
  render: () => React.ReactNode;
}

export function CrmActivityFeed({
  leadId, leadPhone, currentStatusId, statuses, contacts, notes, calls, enrichments, changes, auditLogs,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<ActivityKind>("all");
  // Standardmäßig ist der Anruf-Bereich aufgeklappt, weil das die häufigste
  // Aktion im CRM-Detail ist. User kann per Klick schließen oder auf "Notiz" wechseln.
  const [composeMode, setComposeMode] = useState<"idle" | "note" | "call">("call");
  const [pending, startTransition] = useTransition();
  const activeStatuses = statuses.filter((s) => s.is_active);

  function handleStatusChange(statusId: string) {
    startTransition(async () => {
      await updateCrmStatus(leadId, statusId || null);
      router.refresh();
    });
  }

  // Alle Items vereinen und nach Zeit sortieren
  const items: UnifiedItem[] = [];
  for (const n of notes) {
    items.push({
      id: `n-${n.id}`, kind: "note", at: n.created_at,
      author: n.profiles?.name ?? null,
      render: () => <NoteItem note={n} leadId={leadId} />,
    });
  }
  for (const c of calls) {
    items.push({
      id: `c-${c.id}`, kind: "call", at: c.started_at,
      author: c.profiles?.name ?? null,
      render: () => <CallItem call={c} />,
    });
  }
  for (const e of enrichments) {
    if (!e.completed_at) continue;
    items.push({
      id: `e-${e.id}`, kind: "enrichment", at: e.completed_at,
      author: null,
      render: () => <EnrichmentItem enrichment={e} />,
    });
  }
  for (const log of auditLogs) {
    if (log.action === "lead.crm_status_changed") {
      items.push({
        id: `a-${log.id}`, kind: "status", at: log.created_at,
        author: log.profiles?.name ?? null,
        render: () => <StatusChangeItem log={log} statuses={statuses} kind="crm" />,
      });
    } else if (log.action === "lead.bulk_status_update") {
      items.push({
        id: `a-${log.id}`, kind: "status", at: log.created_at,
        author: log.profiles?.name ?? null,
        render: () => <StatusChangeItem log={log} statuses={statuses} kind="pipeline" />,
      });
    }
  }
  for (const ch of changes) {
    items.push({
      id: `ch-${ch.id}`, kind: "change", at: ch.created_at,
      author: null,
      render: () => <ChangeItem change={ch} />,
    });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);

  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      {/* Toolbar */}
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

      {/* Compose Area */}
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
          onClose={() => setComposeMode("idle")}
          onSaved={() => { setComposeMode("idle"); router.refresh(); }}
        />
      )}

      {/* Feed */}
      <div className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            Keine {filter === "all" ? "Aktivitäten" : filterLabel(filter)} vorhanden.
          </div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} className="flex gap-3 p-4 hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
              <div className="flex-shrink-0">
                <PersonAvatar name={item.author} kind={item.kind} />
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

function actionVerb(kind: ActivityKind): string {
  switch (kind) {
    case "note": return "hat eine Notiz hinzugefügt";
    case "call": return "hat einen Anruf protokolliert";
    case "status": return "hat den Status geändert";
    case "enrichment": return "Lead wurde angereichert";
    case "change": return "hat ein Feld aktualisiert";
    default: return "";
  }
}

function PersonAvatar({ name, kind }: { name: string | null; kind: ActivityKind }) {
  const initials = name
    ? name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
    : "·";
  const hue = name ? hashHue(name) : 210;
  const config: Record<ActivityKind, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
    all: { icon: ActivityIcon, color: "#9ca3af" },
    note: { icon: StickyNote, color: "#f59e0b" },
    call: { icon: PhoneCall, color: "#10b981" },
    status: { icon: ArrowRight, color: "#ec4899" },
    enrichment: { icon: Sparkles, color: "#6366f1" },
    change: { icon: ActivityIcon, color: "#6b7280" },
  };
  const c = config[kind] ?? config.all;
  const Icon = c.icon;
  return (
    <div className="relative">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: `hsl(${hue}, 50%, 45%)` }}
      >
        {initials}
      </div>
      <div
        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-[#1c1c1e]"
        style={{ backgroundColor: c.color }}
      >
        <Icon className="h-2.5 w-2.5 text-white" />
      </div>
    </div>
  );
}

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}

// ─── Toolbar-Teile ───────────────────────────────────────────

function ToolbarButton({
  icon: Icon, label, active, onClick,
}: { icon: React.ComponentType<{ className?: string }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-primary text-white"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function filterLabel(kind: ActivityKind): string {
  switch (kind) {
    case "note": return "Notizen";
    case "call": return "Anrufe";
    case "status": return "Status-Änderungen";
    case "enrichment": return "Anreicherungen";
    case "change": return "Änderungen";
    default: return "Aktivitäten";
  }
}

// ─── Activity Items ──────────────────────────────────────────

function NoteItem({ note, leadId }: { note: NoteRow; leadId: string }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(note.content);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!content.trim()) return;
    startTransition(async () => {
      const res = await updateNote(note.id, leadId, content);
      if (res.error) {
        addToast(res.error, "error");
      } else {
        addToast("Notiz aktualisiert", "success");
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm("Notiz wirklich löschen?")) return;
    startTransition(async () => {
      const res = await deleteNote(note.id, leadId);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Notiz gelöscht", "success");
        router.refresh();
      }
    });
  }

  if (editing) {
    return (
      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          autoFocus
          className="w-full resize-none rounded-md border border-amber-200 bg-amber-50/30 p-2 text-sm dark:border-amber-900/40 dark:bg-amber-900/5"
        />
        <div className="mt-1.5 flex justify-end gap-1">
          <button
            onClick={() => { setEditing(false); setContent(note.content); }}
            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={pending || !content.trim() || content === note.content}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            {pending ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{note.content}</p>
      {note.updated_at && note.updated_at !== note.created_at && (
        <p className="mt-0.5 text-[10px] text-gray-400">
          bearbeitet {new Date(note.updated_at).toLocaleString("de-DE")}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 transition hover:border-primary hover:bg-primary/10 hover:text-primary dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300 dark:hover:bg-primary/20"
          title="Notiz bearbeiten"
        >
          <Pencil className="h-3 w-3" />
          Bearbeiten
        </button>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          title="Notiz löschen"
        >
          <Trash2 className="h-3 w-3" />
          Löschen
        </button>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      {false && <Check className="hidden" />}
    </div>
  );
}

function CallItem({ call }: { call: CallRow }) {
  const directionIcon =
    call.status === "missed" ? <PhoneMissed className="h-3 w-3 text-red-500" />
      : call.direction === "inbound" ? <PhoneIncoming className="h-3 w-3 text-blue-500" />
      : <PhoneOutgoing className="h-3 w-3 text-emerald-500" />;
  const statusLabel: Record<string, string> = {
    initiated: "initiiert", ringing: "klingelt", answered: "angenommen",
    missed: "nicht erreicht", failed: "fehlgeschlagen", ended: "beendet",
  };
  const hasEnded = !!call.ended_at;
  const hasRecording = !!call.recording_url;
  return (
    <div className="text-sm">
      <p className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
        {directionIcon}
        {call.direction === "inbound" ? "Eingehend" : "Ausgehend"}
        <span className="text-gray-500 dark:text-gray-400">· {statusLabel[call.status] ?? call.status}</span>
        {call.duration_seconds != null && (
          <span className="text-xs text-gray-500 dark:text-gray-400">· {formatDur(call.duration_seconds)}</span>
        )}
        {call.phone_number && (
          <span className="text-xs text-gray-500 dark:text-gray-400">· {call.phone_number}</span>
        )}
      </p>
      {call.notes && (
        <p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.notes}</p>
      )}
      {hasRecording && call.recording_url && (
        <audio controls preload="none" src={call.recording_url} className="mt-2 h-8 w-full max-w-sm">
          Dein Browser unterstützt kein HTML5-Audio.
        </audio>
      )}
      {!hasRecording && hasEnded && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
          <Play className="h-3 w-3" />
          Aufzeichnung wird synchronisiert…
        </p>
      )}
    </div>
  );
}

function StatusChangeItem({
  log, statuses, kind,
}: { log: AuditRow; statuses: CustomLeadStatus[]; kind: "crm" | "pipeline" }) {
  if (kind === "crm") {
    const newId = (log.details?.new_status as string | null) ?? null;
    const oldId = (log.details?.old_status as string | null) ?? null;
    return (
      <div className="inline-flex items-center gap-1.5 text-sm">
        <CrmStatusBadge statusId={oldId} statuses={statuses} fallback="—" />
        <ArrowRight className="h-3 w-3 text-gray-400" />
        <CrmStatusBadge statusId={newId} statuses={statuses} fallback="—" />
      </div>
    );
  }
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">
      Pipeline → {String(log.details?.new_status ?? "?")}
    </p>
  );
}

function EnrichmentItem({ enrichment }: { enrichment: LeadEnrichment }) {
  if (enrichment.status === "completed" && !enrichment.error_message) return null;
  return (
    <p className="text-xs text-red-600">{enrichment.error_message}</p>
  );
}

function ChangeItem({ change }: { change: LeadChange }) {
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">
      <span className="font-medium">{change.field_name}:</span>{" "}
      <span className="line-through opacity-60">{change.old_value ?? "–"}</span>
      <ArrowRight className="mx-1 inline-block h-3 w-3" />
      {change.new_value ?? "–"}
    </p>
  );
}

// ─── Compose Forms ────────────────────────────────────────────

function ComposeNote({
  leadId, onClose, onSaved,
}: { leadId: string; onClose: () => void; onSaved: () => void }) {
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToastContext();

  function submit() {
    if (!content.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addNote(leadId, content);
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
      } else {
        setContent("");
        addToast("Notiz gespeichert", "success");
        onSaved();
      }
    });
  }

  return (
    <div className="border-b border-gray-100 bg-amber-50/30 p-4 dark:border-[#2c2c2e] dark:bg-amber-900/5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <StickyNote className="h-3.5 w-3.5" />
          Neue Notiz
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Was ist passiert? Follow-Up? Beobachtung?"
        className="mt-2 w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
          Abbrechen
        </button>
        <button
          onClick={submit}
          disabled={pending || !content.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Notiz speichern"}
        </button>
      </div>
    </div>
  );
}

function ComposeCall({
  leadId, leadPhone, contacts, onClose, onSaved,
}: {
  leadId: string; leadPhone: string | null; contacts: LeadContact[];
  onClose: () => void; onSaved: () => void;
}) {
  const [mode, setMode] = useState<"live" | "log">("live");
  const [contactId, setContactId] = useState("");
  const [phone, setPhone] = useState(leadPhone ?? "");
  const [direction, setDirection] = useState<CallDirection>("outbound");
  const [status, setStatus] = useState<CallStatus>("answered");
  const [duration, setDuration] = useState(0);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToastContext();

  const callable = [
    ...(leadPhone ? [{ label: "Firmennummer", phone: leadPhone, contactId: null as string | null }] : []),
    ...contacts.filter((c) => c.phone).map((c) => ({
      label: c.name + (c.role ? ` (${c.role})` : ""),
      phone: c.phone!,
      contactId: c.id,
    })),
  ];

  function live(p: string, cId: string | null) {
    setError(null);
    startTransition(async () => {
      const res = await startCall({ leadId, phoneNumber: p, contactId: cId });
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
      } else {
        addToast("Anruf gestartet", "success");
        onSaved();
      }
    });
  }

  function logSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await logCall({
        leadId,
        contactId: contactId || null,
        direction,
        status,
        durationSeconds: duration > 0 ? duration : null,
        notes: notes.trim() || null,
        phoneNumber: phone || null,
      });
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
      } else {
        addToast("Anruf protokolliert", "success");
        onSaved();
      }
    });
  }

  return (
    <div className="border-b border-gray-100 bg-emerald-50/30 p-4 dark:border-[#2c2c2e] dark:bg-emerald-900/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <PhoneCall className="h-3.5 w-3.5" />
            Anruf
          </p>
          <div className="flex rounded-md border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
            <button
              onClick={() => setMode("live")}
              className={`rounded px-2 py-0.5 text-xs ${
                mode === "live" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
              }`}
            >
              Jetzt anrufen
            </button>
            <button
              onClick={() => setMode("log")}
              className={`rounded px-2 py-0.5 text-xs ${
                mode === "log" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
              }`}
            >
              Manuell protokollieren
            </button>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
      </div>

      {mode === "live" ? (
        <div className="mt-3 space-y-2">
          {callable.length === 0 ? (
            <p className="text-sm text-gray-400">Keine Telefonnummer vorhanden.</p>
          ) : (
            callable.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
              >
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.phone}</p>
                </div>
                <button
                  onClick={() => live(c.phone, c.contactId)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <PhoneOutgoing className="h-3 w-3" />
                  Anrufen
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={direction} onChange={(e) => setDirection(e.target.value as CallDirection)} className="rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]">
              <option value="outbound">Ausgehend</option>
              <option value="inbound">Eingehend</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as CallStatus)} className="rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]">
              <option value="answered">Angenommen</option>
              <option value="ended">Beendet</option>
              <option value="missed">Nicht erreicht</option>
              <option value="failed">Fehlgeschlagen</option>
            </select>
            <input type="number" min={0} placeholder="Dauer (s)" value={duration || ""} onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)} className="rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]" />
            <input placeholder="Nummer" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]" />
          </div>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]">
            <option value="">Kontakt (optional)</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</option>
            ))}
          </select>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Gesprächsnotiz" className="w-full resize-none rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">Abbrechen</button>
            <button onClick={logSubmit} disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50">
              {pending ? "Speichern…" : "Protokoll speichern"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function formatDur(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `vor ${m} Min`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `vor ${h} Std`;
  }
  if (diff < 7 * 86400) {
    const d = Math.floor(diff / 86400);
    return `vor ${d} ${d === 1 ? "Tag" : "Tagen"}`;
  }
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
