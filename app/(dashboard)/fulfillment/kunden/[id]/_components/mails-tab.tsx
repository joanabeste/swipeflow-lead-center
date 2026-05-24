"use client";

import { useEffect, useState, useTransition } from "react";
import { Inbox, RefreshCw, Send, ChevronLeft, Paperclip } from "lucide-react";
import type { ThreadRow, MessageRow } from "@/lib/email/data";
import { syncMyMailbox, loadThreadMessages, markRead, sendReply, attachThreadToLead, sendNewMail, assignThreadToProject } from "../../../mail-actions";
import { useToastContext } from "../../../../toast-provider";

export function MailsTab({
  leadId,
  initialThreads,
  suggestedThreads = [],
  projects,
  defaultTo,
}: {
  leadId: string;
  initialThreads: ThreadRow[];
  suggestedThreads?: ThreadRow[];
  projects: Array<{ id: string; name: string }>;
  defaultTo: string | null;
}) {
  const { addToast } = useToastContext();
  const [threads, setThreads] = useState<ThreadRow[]>(initialThreads);
  const [suggestions, setSuggestions] = useState<ThreadRow[]>(suggestedThreads);
  const [selected, setSelected] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [syncing, startSync] = useTransition();
  const [composing, setComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    setLoadingMsgs(true);
    void loadThreadMessages(selected).then((res) => {
      if ("error" in res) {
        addToast(res.error, "error");
        setMessages([]);
      } else {
        setMessages(res.messages);
        void markRead(selected);
      }
      setLoadingMsgs(false);
    });
  }, [selected, addToast]);

  function handleSync() {
    startSync(async () => {
      const res = await syncMyMailbox();
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast(`Sync: ${res.inbox} eingehend, ${res.sent} gesendet.`, "success");
        // Threads neu laden via Page-Refresh würde initialThreads neu setzen;
        // einfacher: window.location.reload, oder via router.refresh().
        window.location.reload();
      }
    });
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSending(true);
    const res = await sendReply({ threadId: selected, body: composeBody });
    setSending(false);
    if ("error" in res) addToast(res.error, "error");
    else {
      addToast("Antwort gesendet.", "success");
      setComposeBody("");
      const reload = await loadThreadMessages(selected);
      if (!("error" in reload)) setMessages(reload.messages);
    }
  }

  async function handleNew(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const res = await sendNewMail({
      leadId,
      to: composeTo,
      subject: composeSubject,
      body: composeBody,
    });
    setSending(false);
    if ("error" in res) addToast(res.error, "error");
    else {
      addToast("Mail gesendet.", "success");
      setComposing(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      window.location.reload();
    }
  }

  async function handleAttach(threadId: string) {
    const res = await attachThreadToLead({ threadId, leadId });
    if ("error" in res) addToast(res.error, "error");
    else {
      addToast("Thread zugeordnet.", "success");
      window.location.reload();
    }
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
      setSelected(threadId);
    }
    addToast("Thread zugeordnet.", "success");
  }

  async function handleAssignProject(threadId: string, projectId: string | null) {
    const res = await assignThreadToProject({ threadId, projectId });
    if ("error" in res) addToast(res.error, "error");
    else {
      setThreads((cur) => cur.map((t) => t.id === threadId ? { ...t, project_id: projectId, project_name: projects.find((p) => p.id === projectId)?.name ?? null } : t));
      addToast(projectId ? "Thread Projekt zugeordnet." : "Projekt-Zuordnung entfernt.", "success");
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sync…" : "Synchronisieren"}
          </button>
          <button
            type="button"
            onClick={() => {
              setComposing(true);
              setSelected(null);
              setComposeTo(defaultTo ?? "");
              setComposeSubject("");
              setComposeBody("");
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark"
          >
            <Send className="h-3.5 w-3.5" /> Neue Mail
          </button>
        </div>

        {threads.length === 0 && suggestions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400 dark:border-[#2c2c2e]/60">
            <Inbox className="mx-auto mb-2 h-5 w-5 text-gray-300" />
            Noch keine Mails für diesen Kunden. „Synchronisieren" startet einen IMAP-Pull.
            <br />
            <span className="mt-1 inline-block text-[10px]">Tipp: Wenn der Sync ohne Fehler lief, aber nichts auftaucht — pruefe ob die Kontakt-E-Mails (oder die Lead-Mail) zu den importierten Mails passen.</span>
          </p>
        ) : (
          <ul className="space-y-1">
            {threads.map((t) => {
              const active = t.id === selected;
              const subject = t.subject_normalized || "(ohne Betreff)";
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(t.id);
                      setComposing(false);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${active ? "border-primary/50 bg-primary/5" : "border-gray-200 bg-white hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:bg-white/5"}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium">{subject}</p>
                      {t.unread_count > 0 && (
                        <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-gray-900">{t.unread_count}</span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
                      {t.message_count} Nachricht{t.message_count === 1 ? "" : "en"}
                      {t.last_message_at && ` · ${new Date(t.last_message_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}`}
                    </p>
                    {t.project_name && (
                      <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        📁 {t.project_name}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {suggestions.length > 0 && (
          <div className="mt-4 space-y-1">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Vorschlaege ({suggestions.length}) — Mails mit passender Adresse
            </p>
            <ul className="space-y-1">
              {suggestions.map((t) => (
                <li key={t.id} className="rounded-xl border border-dashed border-amber-300/60 bg-amber-50/50 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-900/10">
                  <p className="line-clamp-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                    {t.subject_normalized || "(ohne Betreff)"}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
                    {t.message_count} Nachricht{t.message_count === 1 ? "" : "en"}
                    {t.last_message_at && ` · ${new Date(t.last_message_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}`}
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
      </aside>

      <section className="min-w-0">
        {composing ? (
          <form onSubmit={handleNew} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
            <h3 className="text-sm font-semibold">Neue E-Mail</h3>
            <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="Empfänger" type="email" required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" />
            <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Betreff" required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" />
            <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={10} placeholder="Nachricht…" required className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setComposing(false)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">Abbrechen</button>
              <button type="submit" disabled={sending} className="rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50">
                {sending ? "Sende…" : "Senden"}
              </button>
            </div>
          </form>
        ) : selected ? (
          <ThreadView
            threadId={selected}
            messages={messages}
            loading={loadingMsgs}
            onBack={() => setSelected(null)}
            onReplySubmit={handleReply}
            replyBody={composeBody}
            setReplyBody={setComposeBody}
            sending={sending}
            leadId={leadId}
            currentThread={threads.find((t) => t.id === selected) ?? null}
            onAttachToLead={handleAttach}
            projects={projects}
            onAssignProject={handleAssignProject}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
            <Inbox className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            Wähle einen Thread aus oder verfasse eine neue Mail.
          </div>
        )}
      </section>
    </div>
  );
}

function ThreadView({
  threadId,
  messages,
  loading,
  onBack,
  onReplySubmit,
  replyBody,
  setReplyBody,
  sending,
  leadId,
  currentThread,
  onAttachToLead,
  projects,
  onAssignProject,
}: {
  threadId: string;
  messages: MessageRow[];
  loading: boolean;
  onBack: () => void;
  onReplySubmit: (e: React.FormEvent) => void;
  replyBody: string;
  setReplyBody: (v: string) => void;
  sending: boolean;
  leadId: string;
  currentThread: ThreadRow | null;
  onAttachToLead: (threadId: string) => void;
  projects: Array<{ id: string; name: string }>;
  onAssignProject: (threadId: string, projectId: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 md:hidden">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:hover:bg-white/5">
          <ChevronLeft className="h-3.5 w-3.5" /> Zurück
        </button>
      </div>

      {currentThread && currentThread.lead_id !== leadId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          Dieser Thread ist diesem Kunden nicht zugeordnet.
          <button type="button" onClick={() => onAttachToLead(threadId)} className="ml-2 font-semibold underline">
            Jetzt zuordnen
          </button>
        </div>
      )}

      {currentThread && projects.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <label htmlFor="thread-project-select" className="text-gray-500">Projekt:</label>
          <select
            id="thread-project-select"
            value={currentThread.project_id ?? ""}
            onChange={(e) => onAssignProject(threadId, e.target.value || null)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          >
            <option value="">— keinem Projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="ml-auto text-[10px] text-gray-400">Mail wird in der Projekt-Detail-Ansicht angezeigt.</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lade Nachrichten…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-gray-500">Keine Nachrichten in diesem Thread.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl border p-3 text-sm ${m.direction === "out" ? "border-primary/30 bg-primary/5" : "border-gray-200 bg-white dark:border-[#2c2c2e]/60 dark:bg-[#161618]"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-gray-500">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {m.from_name || m.from_email || "(unbekannt)"}
                  </span>
                  <span>{new Date(m.received_at).toLocaleString("de-DE")}</span>
                </div>
                {m.subject && <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-400">{m.subject}</p>}
                <div className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100">
                  {m.body_text || (m.body_html ? <em className="text-gray-400">[HTML-Mail — Text-Version fehlt]</em> : <em className="text-gray-400">[leer]</em>)}
                </div>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-white/5 dark:text-gray-300">
                        <Paperclip className="h-3 w-3" /> {a.filename ?? "Anhang"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onReplySubmit} className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          rows={5}
          placeholder="Antwort schreiben…"
          required
          className="w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm focus:outline-none"
        />
        <div className="mt-2 flex justify-end">
          <button type="submit" disabled={sending || !replyBody.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50">
            <Send className="h-3.5 w-3.5" /> {sending ? "Sende…" : "Antworten"}
          </button>
        </div>
      </form>
    </div>
  );
}
