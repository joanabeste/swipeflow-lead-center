"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, Send, AlertCircle } from "lucide-react";
import { sendLeadEmail } from "../../actions";
import { useToastContext } from "../../../toast-provider";

interface Props {
  leadId: string;
  contactId: string;
  contactName: string;
  toEmail: string;
  onClose: () => void;
}

export function SendEmailDialog({ leadId, contactId, contactName, toEmail, onClose }: Props) {
  const { addToast } = useToastContext();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [missingSmtp, setMissingSmtp] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMissingSmtp(false);
    startTransition(async () => {
      const res = await sendLeadEmail({ leadId, contactId, subject, body });
      if ("error" in res) {
        if (res.error.startsWith("Keine SMTP-Zugangsdaten")) {
          setMissingSmtp(true);
        }
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
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
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
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
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
