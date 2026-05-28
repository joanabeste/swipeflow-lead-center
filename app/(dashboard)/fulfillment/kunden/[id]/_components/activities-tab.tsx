"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  Inbox,
  Mail as MailIcon,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  StickyNote,
  RefreshCw,
  Send,
  Sparkles,
  Pencil,
  Trash2,
} from "lucide-react";
import type { MessageRow, ThreadRow } from "@/lib/email/data";
import type { ActivityItem } from "../../../mail-actions";
import {
  attachThreadToLead,
  deleteCallEntry,
  deleteNoteEntry,
  loadThreadMessages,
  markRead,
  sendNewMail,
  sendReply,
  syncMyMailbox,
} from "../../../mail-actions";
import { useToastContext } from "../../../../toast-provider";
import { MailThread } from "./mail-thread";
import { CallEntryModal, NoteEntryModal } from "./activity-modals";
import { AiDraftButton } from "./ai-draft-button";

type FilterKind = "all" | "mails" | "calls" | "notes";
type Selection =
  | { kind: "thread"; id: string }
  | { kind: "call"; id: string }
  | { kind: "note"; id: string }
  | { kind: "compose" }
  | null;

export function ActivitiesTab({
  leadId,
  initialThreads,
  suggestedThreads = [],
  initialActivities,
  projects,
  defaultTo,
}: {
  leadId: string;
  initialThreads: ThreadRow[];
  suggestedThreads?: ThreadRow[];
  initialActivities: ActivityItem[];
  projects: Array<{ id: string; name: string }>;
  defaultTo: string | null;
}) {
  const { addToast } = useToastContext();
  const searchParams = useSearchParams();
  const initialSelection: Selection = searchParams.get("thread")
    ? { kind: "thread", id: searchParams.get("thread") as string }
    : initialThreads[0]
    ? { kind: "thread", id: initialThreads[0].id }
    : null;

  const [threads, setThreads] = useState<ThreadRow[]>(initialThreads);
  const [suggestions, setSuggestions] = useState<ThreadRow[]>(suggestedThreads);
  const [activities, setActivities] = useState<ActivityItem[]>(initialActivities);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [selection, setSelection] = useState<Selection>(initialSelection);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [syncing, startSync] = useTransition();
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  const [callModal, setCallModal] = useState<{
    existing?: { id: string; direction: "inbound" | "outbound"; notes: string | null; durationSeconds: number | null; occurredAt: string } | null;
  } | null>(null);
  const [noteModal, setNoteModal] = useState<{
    existing?: { id: string; content: string; occurredAt: string } | null;
  } | null>(null);

  const selectedThread = useMemo(() => {
    if (selection?.kind !== "thread") return null;
    return threads.find((t) => t.id === selection.id) ?? suggestions.find((t) => t.id === selection.id) ?? null;
  }, [selection, threads, suggestions]);

  const selectedCall = useMemo(() => {
    if (selection?.kind !== "call") return null;
    const found = activities.find((a) => a.kind === "call" && a.id === selection.id);
    return found && found.kind === "call" ? found : null;
  }, [selection, activities]);

  const selectedNote = useMemo(() => {
    if (selection?.kind !== "note") return null;
    const found = activities.find((a) => a.kind === "note" && a.id === selection.id);
    return found && found.kind === "note" ? found : null;
  }, [selection, activities]);

  useEffect(() => {
    if (selection?.kind !== "thread") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([]);
      return;
    }
    const tid = selection.id;
    setLoadingMsgs(true);
    void loadThreadMessages(tid).then((res) => {
      if ("error" in res) {
        addToast(res.error, "error");
        setMessages([]);
      } else {
        setMessages(res.messages);
        void markRead(tid);
        // Lokal unread reset
        setThreads((cur) => cur.map((t) => (t.id === tid ? { ...t, unread_count: 0 } : t)));
      }
      setLoadingMsgs(false);
    });
  }, [selection, addToast]);

  function handleSync() {
    startSync(async () => {
      const res = await syncMyMailbox();
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast(`Sync: ${res.inbox} eingehend, ${res.sent} gesendet.`, "success");
        window.location.reload();
      }
    });
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (selection?.kind !== "thread") return;
    setSending(true);
    const res = await sendReply({ threadId: selection.id, body: replyBody });
    setSending(false);
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    addToast("Antwort gesendet.", "success");
    setReplyBody("");
    const reload = await loadThreadMessages(selection.id);
    if (!("error" in reload)) setMessages(reload.messages);
  }

  async function handleNewMail(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const res = await sendNewMail({
      leadId,
      to: composeTo,
      subject: composeSubject,
      body: composeBody,
    });
    setSending(false);
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    addToast("Mail gesendet.", "success");
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    window.location.reload();
  }

  async function attachSuggestion(threadId: string) {
    const res = await attachThreadToLead({ threadId, leadId });
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    const moved = suggestions.find((s) => s.id === threadId);
    setSuggestions((cur) => cur.filter((s) => s.id !== threadId));
    if (moved) {
      setThreads((cur) => [{ ...moved, lead_id: leadId }, ...cur]);
      setSelection({ kind: "thread", id: threadId });
    }
    addToast("Thread zugeordnet.", "success");
  }

  function patchThread(threadId: string, patch: Partial<ThreadRow>) {
    setThreads((cur) => cur.map((t) => (t.id === threadId ? { ...t, ...patch } : t)));
    setSuggestions((cur) => cur.map((t) => (t.id === threadId ? { ...t, ...patch } : t)));
  }

  // Cluster-Gruppierung der Threads nach topic_cluster_key / project_name.
  const clusters = useMemo(() => {
    const map = new Map<string, { label: string; threads: ThreadRow[] }>();
    for (const t of threads) {
      const key = (t.project_name || t.topic_cluster_key || "Ohne Zuordnung").trim() || "Ohne Zuordnung";
      const entry = map.get(key) ?? { label: key, threads: [] };
      entry.threads.push(t);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => {
      if (a.label === "Ohne Zuordnung") return 1;
      if (b.label === "Ohne Zuordnung") return -1;
      return a.label.localeCompare(b.label, "de");
    });
  }, [threads]);

  const filteredActivities = useMemo(() => {
    if (filter === "calls") return activities.filter((a) => a.kind === "call");
    if (filter === "notes") return activities.filter((a) => a.kind === "note");
    return activities;
  }, [activities, filter]);

  function onActivitySaved() {
    // Aktivitäten neu laden via Server-Action — am einfachsten reload.
    window.location.reload();
  }

  async function onDeleteCall(id: string) {
    if (!confirm("Anruf wirklich löschen?")) return;
    const res = await deleteCallEntry(id, leadId);
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    setActivities((cur) => cur.filter((a) => !(a.kind === "call" && a.id === id)));
    if (selection?.kind === "call" && selection.id === id) setSelection(null);
    addToast("Anruf gelöscht.", "success");
  }
  async function onDeleteNote(id: string) {
    if (!confirm("Notiz wirklich löschen?")) return;
    const res = await deleteNoteEntry(id, leadId);
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    setActivities((cur) => cur.filter((a) => !(a.kind === "note" && a.id === id)));
    if (selection?.kind === "note" && selection.id === id) setSelection(null);
    addToast("Notiz gelöscht.", "success");
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sync…" : "Synchronisieren"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelection({ kind: "compose" });
              setComposeTo(defaultTo ?? "");
              setComposeSubject("");
              setComposeBody("");
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark"
          >
            <Send className="h-3.5 w-3.5" /> Neue Mail
          </button>
          <button
            type="button"
            onClick={() => setCallModal({ existing: null })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
          >
            <PhoneCall className="h-3.5 w-3.5" /> Anruf protokollieren
          </button>
          <button
            type="button"
            onClick={() => setNoteModal({ existing: null })}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
          >
            <StickyNote className="h-3.5 w-3.5" /> Notiz
          </button>
        </div>
      </div>

      {/* Filter-Chips */}
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
        {(
          [
            { id: "all", label: "Alle" },
            { id: "mails", label: "Mails" },
            { id: "calls", label: "Anrufe" },
            { id: "notes", label: "Notizen" },
          ] as const
        ).map((c) => {
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`rounded-lg px-3 py-1 font-medium transition ${
                active ? "bg-primary text-gray-900 shadow-sm" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-[340px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-4">
          {(filter === "all" || filter === "mails") && (
            <div className="space-y-3">
              {clusters.length === 0 && suggestions.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400 dark:border-[#2c2c2e]/60">
                  <Inbox className="mx-auto mb-2 h-5 w-5 text-gray-300" />
                  Noch keine Mails für diesen Kunden. &bdquo;Synchronisieren&ldquo; startet einen IMAP-Pull.
                </p>
              ) : (
                clusters.map((cluster) => (
                  <ClusterGroup
                    key={cluster.label}
                    label={cluster.label}
                    threads={cluster.threads}
                    selectedThreadId={selection?.kind === "thread" ? selection.id : null}
                    onSelect={(id) => setSelection({ kind: "thread", id })}
                  />
                ))
              )}
              {suggestions.length > 0 && (
                <div className="space-y-1">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Vorschläge ({suggestions.length})
                  </p>
                  <ul className="space-y-1">
                    {suggestions.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-xl border border-dashed border-amber-300/60 bg-amber-50/50 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-900/10"
                      >
                        <p className="line-clamp-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                          {t.subject_normalized || "(ohne Betreff)"}
                        </p>
                        <button
                          type="button"
                          onClick={() => attachSuggestion(t.id)}
                          className="mt-1 text-[11px] font-semibold text-primary hover:underline"
                        >
                          Diesem Kunden zuordnen
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {(filter === "all" || filter === "calls" || filter === "notes") && filteredActivities.length > 0 && (
            <div className="space-y-1">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Anrufe & Notizen
              </p>
              <ul className="space-y-1">
                {filteredActivities.map((a) => (
                  <ActivityItemRow
                    key={`${a.kind}-${a.id}`}
                    activity={a}
                    selected={
                      (selection?.kind === a.kind && selection.id === a.id) || false
                    }
                    onSelect={() => setSelection({ kind: a.kind, id: a.id })}
                  />
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Hauptbereich */}
        <section className="min-w-0">
          {selection?.kind === "compose" ? (
            <ComposeForm
              leadId={leadId}
              to={composeTo}
              setTo={setComposeTo}
              subject={composeSubject}
              setSubject={setComposeSubject}
              body={composeBody}
              setBody={setComposeBody}
              sending={sending}
              onCancel={() => setSelection(null)}
              onSubmit={handleNewMail}
            />
          ) : selection?.kind === "thread" ? (
            <MailThread
              threadId={selection.id}
              leadId={leadId}
              thread={selectedThread}
              messages={messages}
              loading={loadingMsgs}
              projects={projects}
              onBack={() => setSelection(null)}
              onReplySubmit={handleReply}
              replyBody={replyBody}
              setReplyBody={setReplyBody}
              sending={sending}
              onLocalThreadUpdate={(patch) => patchThread(selection.id, patch)}
            />
          ) : selection?.kind === "call" && selectedCall ? (
            <CallDetail
              call={selectedCall}
              onEdit={() =>
                setCallModal({
                  existing: {
                    id: selectedCall.id,
                    direction: selectedCall.direction,
                    notes: selectedCall.notes,
                    durationSeconds: selectedCall.duration_seconds,
                    occurredAt: selectedCall.occurred_at,
                  },
                })
              }
              onDelete={() => onDeleteCall(selectedCall.id)}
            />
          ) : selection?.kind === "note" && selectedNote ? (
            <NoteDetail
              note={selectedNote}
              onEdit={() =>
                setNoteModal({
                  existing: {
                    id: selectedNote.id,
                    content: selectedNote.content,
                    occurredAt: selectedNote.occurred_at,
                  },
                })
              }
              onDelete={() => onDeleteNote(selectedNote.id)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
              <Inbox className="mx-auto mb-3 h-8 w-8 text-gray-300" />
              Wähle eine Aktivität aus oder lege eine neue an.
            </div>
          )}
        </section>
      </div>

      {callModal && (
        <CallEntryModal
          leadId={leadId}
          existing={callModal.existing}
          onClose={() => setCallModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {noteModal && (
        <NoteEntryModal
          leadId={leadId}
          existing={noteModal.existing}
          onClose={() => setNoteModal(null)}
          onSaved={onActivitySaved}
        />
      )}
    </div>
  );
}

function ClusterGroup({
  label,
  threads,
  selectedThreadId,
  onSelect,
}: {
  label: string;
  threads: ThreadRow[];
  selectedThreadId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        {label}
        <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[9px] text-gray-500 dark:bg-white/5 dark:text-gray-400">
          {threads.length}
        </span>
      </button>
      {open && (
        <ul className="mt-1 space-y-1">
          {threads.map((t) => {
            const active = t.id === selectedThreadId;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-primary/50 bg-primary/5"
                      : "border-gray-200 bg-white hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-medium">
                      {t.subject_normalized || "(ohne Betreff)"}
                    </p>
                    {t.unread_count > 0 && (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-gray-900">
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
                    {t.message_count} Nachricht{t.message_count === 1 ? "" : "en"}
                    {t.last_message_at &&
                      ` · ${new Date(t.last_message_at).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })}`}
                  </p>
                  {t.auto_project_id && !t.project_id && !t.auto_project_rejected && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      <Sparkles className="h-2.5 w-2.5" /> Vorschlag
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActivityItemRow({
  activity,
  selected,
  onSelect,
}: {
  activity: ActivityItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const dateLabel = new Date(activity.occurred_at).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left transition ${
          selected
            ? "border-primary/50 bg-primary/5"
            : "border-gray-200 bg-white hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:bg-white/5"
        }`}
      >
        {activity.kind === "call" ? (
          activity.direction === "inbound" ? (
            <PhoneIncoming className="mt-0.5 h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <PhoneOutgoing className="mt-0.5 h-3.5 w-3.5 text-primary" />
          )
        ) : (
          <StickyNote className="mt-0.5 h-3.5 w-3.5 text-amber-500" />
        )}
        <div className="flex-1 min-w-0">
          <p className="line-clamp-1 text-sm font-medium">
            {activity.kind === "call" ? activity.notes || "Anruf" : activity.content}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
            {dateLabel}
            {activity.kind === "call" && activity.duration_seconds != null
              ? ` · ${Math.round(activity.duration_seconds / 60)} min`
              : ""}
          </p>
        </div>
      </button>
    </li>
  );
}

function CallDetail({
  call,
  onEdit,
  onDelete,
}: {
  call: Extract<ActivityItem, { kind: "call" }>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gray-600 dark:bg-white/5 dark:text-gray-300">
              <PhoneCall className="h-3 w-3" />
              {call.direction === "inbound" ? "Eingehend" : "Ausgehend"}
            </span>
            {call.duration_seconds != null && <span>{Math.round(call.duration_seconds / 60)} min</span>}
            {call.call_provider !== "manual" && <span className="text-gray-400">via {call.call_provider}</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {new Date(call.occurred_at).toLocaleString("de-DE")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
            title="Bearbeiten"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            title="Löschen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
        {call.notes || <em className="text-gray-400">Keine Notiz.</em>}
      </div>
    </div>
  );
}

function NoteDetail({
  note,
  onEdit,
  onDelete,
}: {
  note: Extract<ActivityItem, { kind: "note" }>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <StickyNote className="h-3 w-3" /> Notiz
          </span>
          <p className="mt-1 text-sm text-gray-500">{new Date(note.occurred_at).toLocaleString("de-DE")}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
            title="Bearbeiten"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            title="Löschen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{note.content}</div>
    </div>
  );
}

function ComposeForm({
  leadId,
  to,
  setTo,
  subject,
  setSubject,
  body,
  setBody,
  sending,
  onCancel,
  onSubmit,
}: {
  leadId: string;
  to: string;
  setTo: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  sending: boolean;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MailIcon className="h-4 w-4 text-primary" /> Neue E-Mail
      </h3>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="Empfänger"
        type="email"
        required
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Betreff"
        required
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={10}
        placeholder="Nachricht…"
        required
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <AiDraftButton
          leadId={leadId}
          recipient={to}
          currentSubject={subject}
          onDraft={(d) => {
            if (d.subject && !subject.trim()) setSubject(d.subject);
            setBody(d.body);
          }}
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">Signatur wird automatisch angehängt.</span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={sending}
            className="rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            {sending ? "Sende…" : "Senden"}
          </button>
        </div>
      </div>
    </form>
  );
}
