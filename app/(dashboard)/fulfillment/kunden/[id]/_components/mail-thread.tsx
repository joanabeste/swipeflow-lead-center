"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronLeft, Download, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import type { MessageRow, ThreadRow } from "@/lib/email/data";
import {
  acceptThreadAutoProjectSuggestion,
  assignThreadToProject,
  attachThreadToLead,
  getAttachmentDownloadUrl,
  rejectThreadAutoProjectSuggestion,
} from "../../../mail-actions";
import { useToastContext } from "../../../../toast-provider";
import { AiDraftButton } from "./ai-draft-button";

export function MailThread({
  threadId,
  leadId,
  thread,
  messages,
  loading,
  projects,
  onBack,
  onReplySubmit,
  replyBody,
  setReplyBody,
  sending,
  onLocalThreadUpdate,
}: {
  threadId: string;
  leadId: string;
  thread: ThreadRow | null;
  messages: MessageRow[];
  loading: boolean;
  projects: Array<{ id: string; name: string }>;
  onBack: () => void;
  onReplySubmit: (e: React.FormEvent) => void;
  replyBody: string;
  setReplyBody: (v: string) => void;
  sending: boolean;
  onLocalThreadUpdate: (patch: Partial<ThreadRow>) => void;
}) {
  const { addToast } = useToastContext();
  const [autoPending, startAutoTransition] = useTransition();

  async function handleAccept() {
    if (!thread?.auto_project_id) return;
    startAutoTransition(async () => {
      const res = await acceptThreadAutoProjectSuggestion(threadId);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Projekt zugeordnet.", "success");
      onLocalThreadUpdate({
        project_id: thread.auto_project_id,
        project_name: thread.auto_project_name ?? null,
      });
    });
  }
  async function handleReject() {
    startAutoTransition(async () => {
      const res = await rejectThreadAutoProjectSuggestion(threadId);
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Vorschlag verworfen.", "success");
      onLocalThreadUpdate({ auto_project_id: null, auto_project_rejected: true });
    });
  }

  async function handleAttachToLead() {
    const res = await attachThreadToLead({ threadId, leadId });
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    addToast("Thread zugeordnet.", "success");
    onLocalThreadUpdate({ lead_id: leadId });
  }

  async function handleAssignProject(projectId: string | null) {
    const res = await assignThreadToProject({ threadId, projectId });
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    onLocalThreadUpdate({
      project_id: projectId,
      project_name: projects.find((p) => p.id === projectId)?.name ?? null,
    });
    addToast(projectId ? "Projekt zugeordnet." : "Projekt-Zuordnung entfernt.", "success");
  }

  const showAutoSuggest =
    thread &&
    thread.auto_project_id &&
    thread.project_id !== thread.auto_project_id &&
    !thread.project_id &&
    !thread.auto_project_rejected;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Zurück
        </button>
      </div>

      {thread && thread.lead_id !== leadId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          Dieser Thread ist diesem Kunden nicht zugeordnet.
          <button type="button" onClick={handleAttachToLead} className="ml-2 font-semibold underline">
            Jetzt zuordnen
          </button>
        </div>
      )}

      {showAutoSuggest && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-gray-700 dark:text-gray-200">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>
            Vorschlag: zu Projekt <strong>{thread?.auto_project_name ?? "?"}</strong> zuordnen
            {thread?.auto_project_score != null && ` (Konfidenz ${Math.round(thread.auto_project_score * 100)} %)`}
          </span>
          {thread?.auto_project_reason && (
            <span className="text-gray-400">— {thread.auto_project_reason}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleAccept}
              disabled={autoPending}
              className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              Übernehmen
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={autoPending}
              className="rounded-md border border-gray-200 px-2 py-1 text-[11px] hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
            >
              Verwerfen
            </button>
          </div>
        </div>
      )}

      {thread && projects.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <label htmlFor="thread-project-select" className="text-gray-500">
            Projekt:
          </label>
          <select
            id="thread-project-select"
            value={thread.project_id ?? ""}
            onChange={(e) => handleAssignProject(e.target.value || null)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          >
            <option value="">— keinem Projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
              <div
                className={`max-w-[85%] rounded-2xl border p-3 text-sm ${
                  m.direction === "out"
                    ? "border-primary/30 bg-primary/5"
                    : "border-gray-200 bg-white dark:border-[#2c2c2e]/60 dark:bg-[#161618]"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-gray-500">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {m.from_name || m.from_email || "(unbekannt)"}
                  </span>
                  <span>{new Date(m.received_at).toLocaleString("de-DE")}</span>
                </div>
                {m.subject && <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-400">{m.subject}</p>}
                <div className="mt-2 text-sm text-gray-800 dark:text-gray-100">
                  <EmailBody text={m.body_text} html={m.body_html} />
                </div>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a, i) => (
                      <AttachmentChip
                        key={i}
                        messageId={m.id}
                        index={i}
                        filename={a.filename}
                        contentType={a.contentType}
                        size={a.size}
                        hasStorage={!!a.storage_path}
                        uploadError={a.upload_error ?? null}
                      />
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={onReplySubmit}
        className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
      >
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          rows={5}
          placeholder="Antwort schreiben…"
          required
          className="w-full rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <AiDraftButton
            leadId={leadId}
            threadId={threadId}
            onDraft={(d) => setReplyBody(d.body)}
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">Signatur wird automatisch angehängt.</span>
            <button
              type="submit"
              disabled={sending || !replyBody.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              {sending ? "Sende…" : "Antworten"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Email Body (Plaintext + HTML) ────────────────────────────────────

const QUOTE_HEADER_RE = /^(Am\s.+schrieb.+:|On\s.+wrote:|Von:\s|Gesendet:\s|-----+\s*(Urspruengliche|Original|Weitergeleitete?)\s)/i;
const SIG_CONTACT_RE = /^(Telefon|Tel\.?|E-Mail|Mail|Webseite|Web|Mobil|Fax|Anschrift|Phone)\s*:/i;

function parseEmailBody(text: string): { main: string; signature: string; quoted: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  let quoteStart = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith(">") || QUOTE_HEADER_RE.test(l.trim())) {
      quoteStart = i;
      break;
    }
  }

  let mainEnd = quoteStart;
  while (mainEnd > 0 && lines[mainEnd - 1].trim() === "") mainEnd--;

  let sigStart: number | null = null;
  for (let i = 0; i < mainEnd; i++) {
    if (lines[i] === "-- " || lines[i].trim() === "--") {
      sigStart = i;
      break;
    }
  }
  if (sigStart === null) {
    let firstContact = -1;
    for (let i = 0; i < mainEnd; i++) {
      if (SIG_CONTACT_RE.test(lines[i].trim())) {
        firstContact = i;
        break;
      }
    }
    if (firstContact !== -1) {
      let s = firstContact;
      while (s > 0 && lines[s - 1].trim() !== "") s--;
      sigStart = s;
    }
  }

  const mainSliceEnd = sigStart ?? mainEnd;
  const main = lines.slice(0, mainSliceEnd).join("\n").trimEnd();
  const signature = sigStart !== null ? lines.slice(sigStart, mainEnd).join("\n").trim() : "";
  const quoted = lines.slice(quoteStart).join("\n").trim();
  return { main, signature, quoted };
}

export function EmailBody({ text, html }: { text: string | null; html: string | null }) {
  const [mode, setMode] = useState<"html" | "text">(html ? "html" : "text");

  if (!text && !html) {
    return <em className="text-gray-400">[leer]</em>;
  }

  if (mode === "html" && html) {
    return (
      <div>
        <HtmlBody html={html} />
        {text && (
          <button
            type="button"
            onClick={() => setMode("text")}
            className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Plaintext anzeigen
          </button>
        )}
      </div>
    );
  }

  if (!text) {
    return <em className="text-gray-400">[HTML-Mail — Text-Version fehlt]</em>;
  }

  const { main, signature, quoted } = parseEmailBody(text);
  return (
    <PlaintextBody
      main={main}
      signature={signature}
      quoted={quoted}
      onSwitchHtml={html ? () => setMode("html") : null}
    />
  );
}

function HtmlBody({ html }: { html: string }) {
  const [sanitized, setSanitized] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/email/html").then((m) => {
      if (!cancelled) setSanitized(m.sanitizeMailHtml(html));
    });
    return () => {
      cancelled = true;
    };
  }, [html]);
  if (!sanitized) {
    return <div className="text-xs text-gray-400">Lade Mail-Inhalt…</div>;
  }
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none [&_a]:text-primary [&_table]:max-w-full [&_img]:max-w-full [&_img]:h-auto"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

function PlaintextBody({
  main,
  signature,
  quoted,
  onSwitchHtml,
}: {
  main: string;
  signature: string;
  quoted: string;
  onSwitchHtml: (() => void) | null;
}) {
  const [showSig, setShowSig] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  return (
    <div className="space-y-2">
      <div className="whitespace-pre-wrap break-words leading-relaxed">
        {main || <em className="text-gray-400">[leer]</em>}
      </div>

      {signature && (
        <div>
          {showSig ? (
            <div className="whitespace-pre-wrap break-words border-l-2 border-gray-200 pl-3 text-xs text-gray-500 dark:border-[#2c2c2e]/60 dark:text-gray-400">
              {signature}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSig(true)}
              className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Signatur anzeigen
            </button>
          )}
        </div>
      )}

      {quoted && (
        <div>
          {showQuoted ? (
            <div className="mt-1 whitespace-pre-wrap break-words border-l-2 border-gray-300 pl-3 text-xs text-gray-500 dark:border-[#2c2c2e]/80 dark:text-gray-400">
              {quoted}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowQuoted(true)}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:text-gray-400 dark:hover:bg-white/5"
            >
              <ChevronDown className="h-3 w-3" /> Vorherigen Verlauf anzeigen
            </button>
          )}
        </div>
      )}

      {onSwitchHtml && (
        <button
          type="button"
          onClick={onSwitchHtml}
          className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Original-HTML anzeigen
        </button>
      )}
    </div>
  );
}

// ─── Attachments ────────────────────────────────────────────────────

function isPreviewable(mime: string | null | undefined): "image" | "pdf" | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  return null;
}

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentChip({
  messageId,
  index,
  filename,
  contentType,
  size,
  hasStorage,
  uploadError,
}: {
  messageId: string;
  index: number;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  hasStorage: boolean;
  uploadError: string | null;
}) {
  const { addToast } = useToastContext();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; kind: "image" | "pdf"; filename: string | null } | null>(null);

  const disabled = !hasStorage;
  const title = uploadError
    ? `Upload-Fehler: ${uploadError}`
    : !hasStorage
    ? "Vor Update synchronisiert — Anhang nicht verfügbar."
    : `${filename ?? "Anhang"}${size ? ` · ${formatBytes(size)}` : ""}`;

  async function handleClick() {
    if (disabled || loading) return;
    setLoading(true);
    const res = await getAttachmentDownloadUrl({ messageId, attachmentIndex: index });
    setLoading(false);
    if ("error" in res) {
      addToast(res.error, "error");
      return;
    }
    const kind = isPreviewable(res.mime_type);
    if (kind) {
      setPreview({ url: res.url, kind, filename: res.filename });
    } else {
      const a = document.createElement("a");
      a.href = res.url;
      a.download = res.filename ?? "anhang";
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        title={title}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition ${
          disabled
            ? "cursor-not-allowed bg-gray-50 text-gray-400 dark:bg-white/[0.02] dark:text-gray-500"
            : "bg-gray-100 text-gray-700 hover:bg-primary/10 hover:text-primary dark:bg-white/5 dark:text-gray-200 dark:hover:bg-primary/20"
        }`}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
        <span className="max-w-[160px] truncate">{filename ?? "Anhang"}</span>
        {size ? <span className="text-gray-400">· {formatBytes(size)}</span> : null}
      </button>

      {preview && (
        <AttachmentPreviewModal
          url={preview.url}
          kind={preview.kind}
          filename={preview.filename}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

function AttachmentPreviewModal({
  url,
  kind,
  filename,
  onClose,
}: {
  url: string;
  kind: "image" | "pdf";
  filename: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-5xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2 dark:border-[#2c2c2e]/60">
          <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
            {filename ?? "Anhang"}
          </span>
          <div className="flex items-center gap-1">
            <a
              href={url}
              download={filename ?? "anhang"}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
              aria-label="Schliessen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex max-h-[80vh] items-center justify-center overflow-auto bg-gray-50 p-2 dark:bg-[#0d0d0f]">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={filename ?? "Anhang"} className="max-h-[78vh] max-w-full object-contain" />
          ) : (
            <iframe src={url} title={filename ?? "PDF"} className="h-[78vh] w-full rounded-md bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}
