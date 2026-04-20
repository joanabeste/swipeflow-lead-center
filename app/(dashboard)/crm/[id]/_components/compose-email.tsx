"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Mail, X, Send, AlertCircle, FileText, UserRound } from "lucide-react";
import type { LeadContact } from "@/lib/types";
import { isHrContact } from "@/lib/recruiting/hr-contact";
import { loadMyEmailTemplates, sendLeadEmail, updateContactSalutation } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import {
  BUILT_IN_VARIABLES,
  buildBuiltInContext,
  extractVariables,
  renderTemplate,
  type EmailTemplate,
} from "@/lib/email/templates";

export function ComposeEmail({
  leadId, contacts, companyName, senderName, onClose, onSaved,
}: {
  leadId: string;
  contacts: LeadContact[];
  companyName: string;
  senderName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToastContext();

  const emailableContacts = useMemo(
    () => contacts.filter((c) => !!c.email),
    [contacts],
  );
  const defaultContactId = useMemo(() => {
    const hr = emailableContacts.find((c) => isHrContact(c.role));
    return (hr ?? emailableContacts[0])?.id ?? "";
  }, [emailableContacts]);

  const [contactId, setContactId] = useState<string>(defaultContactId);
  const selectedContact = emailableContacts.find((c) => c.id === contactId) ?? null;

  // Anrede wird lokal gespiegelt, damit der Quick-Fix sofort im UI greift
  // ohne das Panel zu schließen.
  const [salutationById, setSalutationById] = useState<Record<string, "herr" | "frau" | null>>(() =>
    Object.fromEntries(emailableContacts.map((c) => [c.id, c.salutation ?? null])),
  );
  const salutation = selectedContact ? salutationById[selectedContact.id] ?? null : null;

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [customVarValues, setCustomVarValues] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [missingSmtp, setMissingSmtp] = useState(false);
  const [pending, startTransition] = useTransition();
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
    contactName: selectedContact?.name ?? null,
    contactRole: selectedContact?.role ?? null,
    contactSalutation: salutation,
    companyName,
    senderName,
  });

  const usesSalutationVar =
    (subject + "\n" + body).match(/\{\{\s*(anrede|contact_salutation)\s*\}\}/i) != null;
  const needsSalutationPrompt =
    !!selectedContact && usesSalutationVar && salutation == null;

  function handlePickSalutation(value: "herr" | "frau") {
    if (!selectedContact) return;
    const cId = selectedContact.id;
    setSalutationById((prev) => ({ ...prev, [cId]: value }));
    startSalutationTransition(async () => {
      const res = await updateContactSalutation(cId, value);
      if (res.error) {
        addToast(res.error, "error");
        setSalutationById((prev) => ({ ...prev, [cId]: selectedContact.salutation ?? null }));
      } else {
        addToast("Anrede gespeichert.", "success");
      }
    });
  }

  function applyTemplate(id: string) {
    setActiveTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
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

  function submit() {
    if (!selectedContact?.email) return;
    setError(null);
    setMissingSmtp(false);
    const ctx: Record<string, string> = { ...builtInCtx, ...customVarValues };
    const finalSubject = renderTemplate(subject, ctx);
    const finalBody = renderTemplate(body, ctx);
    startTransition(async () => {
      const res = await sendLeadEmail({
        leadId,
        contactId: selectedContact.id,
        subject: finalSubject,
        body: finalBody,
      });
      if ("error" in res) {
        if (res.error.startsWith("Keine SMTP-Zugangsdaten")) setMissingSmtp(true);
        setError(res.error);
        addToast(res.error, "error");
      } else {
        addToast("E-Mail gesendet.", "success");
        onSaved();
      }
    });
  }

  const noRecipients = emailableContacts.length === 0;

  return (
    <div className="border-b border-gray-100 bg-blue-50/30 p-4 dark:border-[#2c2c2e] dark:bg-blue-900/10">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400">
          <Mail className="h-3.5 w-3.5" />
          Neue E-Mail
        </p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {noRecipients ? (
        <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          Kein Kontakt mit E-Mail-Adresse hinterlegt. Lege zuerst einen Ansprechpartner mit E-Mail an.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor="email-to" className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              Empfänger
            </label>
            <select
              id="email-to"
              value={contactId}
              onChange={(e) => {
                setContactId(e.target.value);
                // Custom-Vars bleiben — nur Empfänger-Wechsel, kein Template-Reset.
              }}
              className="mt-1 block w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
            >
              {emailableContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? ` · ${c.role}` : ""}
                  {c.email ? ` <${c.email}>` : ""}
                </option>
              ))}
            </select>
          </div>

          {templates.length > 0 && (
            <div>
              <label htmlFor="email-tpl" className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                <FileText className="h-3 w-3" />
                Vorlage
              </label>
              <select
                id="email-tpl"
                value={activeTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
              >
                <option value="">— keine Vorlage —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {needsSalutationPrompt && selectedContact && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900/40 dark:bg-amber-900/20">
              <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
                <UserRound className="h-3.5 w-3.5" />
                Anrede für {selectedContact.name} unbekannt
              </div>
              <p className="mt-1 text-amber-700 dark:text-amber-300">
                Ohne Festlegung wird <code className="rounded bg-white/60 px-1 dark:bg-black/20">Sehr geehrte Damen und Herren</code> verwendet.
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => handlePickSalutation("herr")}
                  disabled={salutationSaving}
                  className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/40"
                >
                  Herr
                </button>
                <button
                  type="button"
                  onClick={() => handlePickSalutation("frau")}
                  disabled={salutationSaving}
                  className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/40"
                >
                  Frau
                </button>
              </div>
            </div>
          )}

          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Betreff"
            className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder={selectedContact ? `Hallo ${selectedContact.name.split(" ")[0]},\n\n…` : "Nachricht"}
            className="w-full resize-none rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
          />

          {customVars.length > 0 && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
              <p className="text-xs font-medium text-primary">
                Variablen in der Vorlage — bitte manuell befüllen:
              </p>
              <div className="mt-1.5 space-y-1.5">
                {customVars.map((v) => (
                  <div key={v}>
                    <label htmlFor={`email-var-${v}`} className="block text-[11px] font-medium">
                      {`{{${v}}}`}
                    </label>
                    <input
                      id={`email-var-${v}`}
                      type="text"
                      value={customVarValues[v] ?? ""}
                      onChange={(e) =>
                        setCustomVarValues((prev) => ({ ...prev, [v]: e.target.value }))
                      }
                      placeholder={v === "loom_url" ? "https://www.loom.com/share/…" : `Wert für ${v}`}
                      className="mt-0.5 block w-full rounded-md border border-gray-200 bg-white p-1 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </div>
              {missingSmtp && (
                <Link
                  href="/einstellungen/email"
                  className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline"
                >
                  SMTP-Zugangsdaten einrichten →
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              onClick={submit}
              disabled={pending || !subject.trim() || !body.trim() || !selectedContact}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              {pending ? "Sende…" : "Senden"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
