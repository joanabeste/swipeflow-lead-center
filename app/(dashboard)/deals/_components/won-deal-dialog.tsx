"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, PartyPopper, ChevronDown, ChevronUp } from "lucide-react";
import type { DealWithRelations } from "@/lib/deals/types";
import { createProjectFromDeal } from "../actions";
import { useToastContext } from "../../toast-provider";

interface Props {
  deal: DealWithRelations | null;
  onClose: () => void;
}

type Vertical = "" | "webdesign" | "recruiting" | "sonstiges";

export function WonDealDialog({ deal, onClose }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [projectName, setProjectName] = useState("");
  const [vertical, setVertical] = useState<Vertical>("");
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState({
    first_name: "",
    last_name: "",
    salutation: "sie" as "du" | "sie",
    role: "",
    email: "",
    phone: "",
  });

  // Bei jedem neuen Deal Formular zurücksetzen.
  useEffect(() => {
    if (!deal) return;
    setProjectName(deal.title);
    setVertical("");
    setStartedAt(new Date().toISOString().slice(0, 10));
    setNotes("");
    setContactOpen(false);
    setContact({ first_name: "", last_name: "", salutation: "sie", role: "", email: "", phone: "" });
  }, [deal]);

  if (!deal) return null;

  const hasLead = !!deal.leadId;
  const companyDisplay = deal.company_name || "—";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!deal) return;
    if (!projectName.trim()) {
      addToast("Projekt-Name fehlt.", "error");
      return;
    }
    const includeContact = contactOpen && contact.first_name.trim().length > 0;
    startTransition(async () => {
      const res = await createProjectFromDeal(deal.id, {
        projectName,
        vertical: vertical || undefined,
        startedAt: startedAt || null,
        notes: notes || null,
        primaryContact: includeContact ? contact : null,
      });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast(
        res.data.alreadyExisted ? "Projekt existiert bereits — geöffnet." : "Projekt angelegt.",
        "success",
      );
      onClose();
      router.push(`/fulfillment/projekte/${res.data.projectId}`);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !pending && onClose()}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Deal gewonnen — Projekt anlegen</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-[#1c1c1e] dark:text-gray-400">
          {hasLead ? (
            <>Kunde: <span className="font-medium text-gray-900 dark:text-gray-100">{companyDisplay}</span></>
          ) : (
            <>Es wird ein neuer Kunde <span className="font-medium text-gray-900 dark:text-gray-100">„{companyDisplay}"</span> angelegt.</>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Projekt-Name *" full>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className={inputCls}
              required
              autoFocus
            />
          </Field>
          <Field label="Bereich">
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value as Vertical)}
              className={inputCls}
            >
              <option value="">—</option>
              <option value="webdesign">Webdesign</option>
              <option value="recruiting">Recruiting</option>
              <option value="sonstiges">Sonstiges</option>
            </select>
          </Field>
          <Field label="Startdatum">
            <input
              type="date"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Notizen" full>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputCls} min-h-[60px]`}
            />
          </Field>
        </div>

        {!hasLead && (
          <div className="mt-4 rounded-xl border border-gray-200 dark:border-[#2c2c2e]/60">
            <button
              type="button"
              onClick={() => setContactOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              <span>Primärer Ansprechpartner (optional)</span>
              {contactOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {contactOpen && (
              <div className="grid gap-3 border-t border-gray-200 p-3 sm:grid-cols-2 dark:border-[#2c2c2e]/60">
                <Field label="Vorname">
                  <input
                    value={contact.first_name}
                    onChange={(e) => setContact({ ...contact, first_name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Nachname">
                  <input
                    value={contact.last_name}
                    onChange={(e) => setContact({ ...contact, last_name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Anrede">
                  <select
                    value={contact.salutation}
                    onChange={(e) => setContact({ ...contact, salutation: e.target.value as "du" | "sie" })}
                    className={inputCls}
                  >
                    <option value="sie">Sie</option>
                    <option value="du">Du</option>
                  </select>
                </Field>
                <Field label="Rolle">
                  <input
                    value={contact.role}
                    onChange={(e) => setContact({ ...contact, role: e.target.value })}
                    placeholder="z. B. Geschäftsführung"
                    className={inputCls}
                  />
                </Field>
                <Field label="E-Mail">
                  <input
                    type="email"
                    value={contact.email}
                    onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Telefon">
                  <input
                    value={contact.phone}
                    onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
          >
            Später
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            {pending ? "Anlegen…" : "Projekt anlegen"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100";

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
