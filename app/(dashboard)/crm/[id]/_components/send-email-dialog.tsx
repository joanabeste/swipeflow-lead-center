"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { X, Send, AlertCircle, FileText, UserRound } from "lucide-react";
import { loadMyEmailTemplates, sendLeadEmail, updateContactSalutation } from "../../actions";
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
  contactSalutation: "herr" | "frau" | null;
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
  contactSalutation,
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
  // Lokaler Salutation-State, damit das UI nach dem Quick-Fix sofort
  // reagieren kann, ohne den Dialog zu schließen.
  const [salutation, setSalutation] = useState<"herr" | "frau" | null>(contactSalutation);
  const [salutationSaving, startSalutationTransition] = useTransition();

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
    contactSalutation: salutation,
    companyName,
    senderName,
  });

  // Warnen, wenn das Template eine Anrede-Variable nutzt, aber keine
  // Anrede hinterlegt ist — dann käme sonst "Sehr geehrte Damen und Herren"
  // heraus, obwohl der Kontakt eigentlich persönlich adressiert werden soll.
  const usesSalutationVar =
    (subject + "\n" + body).match(/\{\{\s*(anrede|contact_salutation)\s*\}\}/i) != null;
  const needsSalutationPrompt = usesSalutationVar && salutation == null;

  function handlePickSalutation(value: "herr" | "frau") {
    setSalutation(value);
    startSalutationTransition(async () => {
      const res = await updateContactSalutation(contactId, value);
      if (res.error) {
        addToast(res.error, "error");
        setSalutation(contactSalutation);
      } else {
        addToast("Anrede gespeichert.", "success");
      }
    });
  }

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

          {needsSalutationPrompt && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-900/20">
              <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
                <UserRound className="h-4 w-4" />
                Anrede für {contactName} unbekannt
              </div>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Ohne Festlegung wird <code className="rounded bg-white/60 px-1 dark:bg-black/20">Sehr geehrte Damen und Herren</code> verwendet.
              </p>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePickSalutation("herr")}
                  disabled={salutationSaving}
                  className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/40"
                >
                  Herr
                </button>
                <button
                  type="button"
                  onClick={() => handlePickSalutation("frau")}
                  disabled={salutationSaving}
                  className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/40"
                >
                  Frau
                </button>
              </div>
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
