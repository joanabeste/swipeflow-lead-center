"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { X, Send, AlertCircle, FileText } from "lucide-react";
import { loadMyEmailTemplates, sendLeadEmail } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import {
  BUILT_IN_VARIABLES,
  buildBuiltInContext,
  extractVariables,
  renderTemplate,
  type EmailTemplate,
} from "@/lib/email/templates";

interface Props {
  leadId: string;
  contactId: string;
  contactName: string;
  contactRole: string | null;
  companyName: string;
  toEmail: string;
  senderName: string | null;
  onClose: () => void;
}

export function SendEmailDialog({
  leadId,
  contactId,
  contactName,
  contactRole,
  companyName,
  toEmail,
  senderName,
  onClose,
}: Props) {
  const { addToast } = useToastContext();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [missingSmtp, setMissingSmtp] = useState(false);
  const [pending, startTransition] = useTransition();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    loadMyEmailTemplates().then((list) => {
      if (!cancelled) setTemplates(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const builtInCtx = buildBuiltInContext({
    contactName,
    contactRole,
    companyName,
    senderName,
  });

  function applyTemplate(id: string) {
    setActiveTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) {
      return;
    }
    setSubject(tpl.subject);
    setBody(tpl.body);
    // Custom-Vars initialisieren (leer) — Built-in-Vars werden erst beim Senden substituiert.
    const vars = extractVariables(tpl.subject + "\n" + tpl.body);
    const customs: Record<string, string> = {};
    for (const v of vars) {
      if (!BUILT_IN_VARIABLES.includes(v as typeof BUILT_IN_VARIABLES[number])) {
        customs[v] = "";
      }
    }
    setCustomVarValues(customs);
  }

  const allVars = extractVariables(subject + "\n" + body);
  const customVars = allVars.filter(
    (v) => !BUILT_IN_VARIABLES.includes(v as typeof BUILT_IN_VARIABLES[number]),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMissingSmtp(false);
    // Built-ins + Custom-Vars mergen und final rendern.
    const ctx: Record<string, string> = { ...builtInCtx, ...customVarValues };
    const finalSubject = renderTemplate(subject, ctx);
    const finalBody = renderTemplate(body, ctx);
    startTransition(async () => {
      const res = await sendLeadEmail({
        leadId,
        contactId,
        subject: finalSubject,
        body: finalBody,
      });
      if ("error" in res) {
        if (res.error.startsWith("Keine SMTP-Zugangsdaten")) setMissingSmtp(true);
        setError(res.error);
      } else {
        addToast("E-Mail gesendet.", "success");
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <h2 className="text-lg font-semibold">E-Mail senden</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-xs dark:border-[#2c2c2e] dark:bg-white/[0.02]">
            <span className="text-gray-500 dark:text-gray-400">An: </span>
            <span className="font-medium">{contactName}</span>
            <span className="ml-2 text-gray-500 dark:text-gray-400">&lt;{toEmail}&gt;</span>
          </div>

          {templates.length > 0 && (
            <div>
              <label htmlFor="tpl-select" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                <FileText className="h-3.5 w-3.5" />
                Vorlage wählen
              </label>
              <select
                id="tpl-select"
                value={activeTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              >
                <option value="">— keine Vorlage —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
              {missingSmtp && (
                <Link
                  href="/einstellungen/email"
                  className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                >
                  SMTP-Zugangsdaten einrichten →
                </Link>
              )}
            </div>
          )}

          <div>
            <label htmlFor="subject" className="block text-sm font-medium">Betreff</label>
            <input
              id="subject"
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-medium">Nachricht</label>
            <textarea
              id="body"
              required
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Hallo ${contactName.split(" ")[0]},\n\n…`}
              className="mt-1.5 block w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          {customVars.length > 0 && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-medium text-primary">
                Variablen in der Vorlage — bitte manuell befüllen:
              </p>
              <div className="mt-2 space-y-2">
                {customVars.map((v) => (
                  <div key={v}>
                    <label htmlFor={`var-${v}`} className="block text-xs font-medium">
                      {`{{${v}}}`}
                    </label>
                    <input
                      id={`var-${v}`}
                      type="text"
                      value={customVarValues[v] ?? ""}
                      onChange={(e) =>
                        setCustomVarValues((prev) => ({ ...prev, [v]: e.target.value }))
                      }
                      placeholder={v === "loom_url" ? "https://www.loom.com/share/…" : `Wert für ${v}`}
                      className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending || !subject.trim() || !body.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {pending ? "Sende…" : "Senden"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
