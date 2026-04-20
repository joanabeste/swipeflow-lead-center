"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import type { EmailTemplate } from "@/lib/email/templates";
import { BUILT_IN_VARIABLES, extractVariables, renderTemplate, buildBuiltInContext } from "@/lib/email/templates";
import { saveEmailTemplate, deleteEmailTemplate } from "../actions";
import { useToastContext } from "../../toast-provider";
import { Card, FormStatus, SubmitButton } from "./ui";

export function EmailTemplatesManager({ templates }: { templates: EmailTemplate[] }) {
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const { addToast } = useToastContext();
  const [deletingId, startDelete] = useTransition();

  function handleDelete(id: string, name: string) {
    if (!confirm(`Vorlage „${name}" löschen?`)) return;
    startDelete(async () => {
      const res = await deleteEmailTemplate(id);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Vorlage gelöscht.", "success");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Deine Vorlagen ({templates.length})</h2>
        <button
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-3.5 w-3.5" />
          Neue Vorlage
        </button>
      </div>

      {templates.length === 0 && !creating && (
        <p className="mt-6 rounded-md border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-[#2c2c2e]">
          Noch keine Vorlagen. Klick auf &bdquo;Neue Vorlage&ldquo; um zu starten.
        </p>
      )}

      {templates.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-md border border-gray-200 p-3 dark:border-[#2c2c2e]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{t.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  Betreff: {t.subject}
                </p>
              </div>
              <button
                onClick={() => { setEditing(t); setCreating(false); }}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
                title="Bearbeiten"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(t.id, t.name)}
                disabled={deletingId}
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                title="Löschen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <TemplateEditorModal
          template={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function TemplateEditorModal({
  template,
  onClose,
}: {
  template: EmailTemplate | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [state, formAction, pending] = useActionState(saveEmailTemplate, undefined);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");

  // Auto-close when success.
  if (state?.success) {
    addToast("Vorlage gespeichert.", "success");
    onClose();
    router.refresh();
    return null;
  }

  function insertVariable(varName: string) {
    // Einfügen beim Cursor in das zuletzt fokussierte Feld.
    const target = document.activeElement === subjectRef.current ? "subject" : "body";
    const el = target === "subject" ? subjectRef.current : bodyRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const token = `{{${varName}}}`;
    const current = target === "subject" ? subject : body;
    const next = current.slice(0, start) + token + current.slice(end);
    if (target === "subject") setSubject(next);
    else setBody(next);
    // Cursor hinter Token setzen
    queueMicrotask(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // Live-Vorschau mit Dummy-Werten
  const context = buildBuiltInContext({
    contactName: "Anna Beispiel",
    contactRole: "HR-Managerin",
    contactSalutation: "frau",
    companyName: "Beispiel GmbH",
    senderName: "Du",
  });
  // Custom-Variablen mit Platzhalter
  const customVars = extractVariables(subject + "\n" + body).filter(
    (v) => !BUILT_IN_VARIABLES.includes(v as typeof BUILT_IN_VARIABLES[number]),
  );
  const fullContext: Record<string, string> = { ...context };
  for (const v of customVars) fullContext[v] = `‹${v}›`;
  const previewSubject = renderTemplate(subject, fullContext);
  const previewBody = renderTemplate(body, fullContext);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <h2 className="text-lg font-semibold">
            {template ? "Vorlage bearbeiten" : "Neue Vorlage"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={formAction} className="space-y-4 p-6">
          {template && <input type="hidden" name="id" value={template.id} />}
          <FormStatus state={state} />

          <div>
            <label htmlFor="tpl-name" className="block text-sm font-medium">
              Name (interner Titel)
            </label>
            <input
              id="tpl-name"
              name="name"
              type="text"
              required
              defaultValue={template?.name ?? ""}
              placeholder="z.B. Loom-Follow-up"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              Variablen einfügen (Klick beim aktiven Feld):
            </p>
            <div className="flex flex-wrap gap-1">
              {BUILT_IN_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 hover:border-primary hover:text-primary dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-300"
                >
                  {"{{"}{v}{"}}"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const name = prompt("Variablen-Name (z.B. loom_url):")?.trim();
                  if (name && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) insertVariable(name);
                }}
                className="rounded-full border border-dashed border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-500 hover:border-primary hover:text-primary dark:border-[#2c2c2e] dark:bg-[#232325]"
              >
                + Eigene Variable
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="tpl-subject" className="block text-sm font-medium">Betreff</label>
            <input
              id="tpl-subject"
              ref={subjectRef}
              name="subject"
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="z.B. Kurzes Video zu unserem Gespräch"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="tpl-body" className="block text-sm font-medium">Nachricht</label>
            <textarea
              id="tpl-body"
              ref={bodyRef}
              name="body"
              required
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Hallo {{contact_first_name}},\n\n…\n\nDas Video findest du hier: {{loom_url}}\n\nLiebe Grüße\n{{sender_name}}`}
              className="mt-1.5 block w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          <details className="rounded-md border border-gray-200 p-3 dark:border-[#2c2c2e]">
            <summary className="cursor-pointer text-sm font-medium">Live-Vorschau (Dummy-Werte)</summary>
            <div className="mt-3 space-y-2 text-sm">
              <p><span className="text-gray-500 dark:text-gray-400">Betreff:</span> {previewSubject}</p>
              <pre className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">{previewBody}</pre>
              {customVars.length > 0 && (
                <p className="text-xs text-gray-500">
                  Eigene Variablen ({customVars.join(", ")}) werden beim Senden manuell befüllt.
                </p>
              )}
            </div>
          </details>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <SubmitButton pending={pending}>
              <Check className="h-3.5 w-3.5" />
              Speichern
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
