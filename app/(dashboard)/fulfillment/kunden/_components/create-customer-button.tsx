"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { createCustomer } from "../actions";
import { useToastContext } from "../../../toast-provider";

type Vertical = "" | "webdesign" | "recruiting" | "sonstiges";

export function CreateCustomerButton() {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    company_name: "",
    website: "",
    city: "",
    vertical: "" as Vertical,
  });
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState({
    first_name: "",
    last_name: "",
    salutation: "sie" as "du" | "sie",
    role: "",
    email: "",
    phone: "",
  });

  function resetAndClose() {
    setOpen(false);
    setDraft({ company_name: "", website: "", city: "", vertical: "" });
    setContact({ first_name: "", last_name: "", salutation: "sie", role: "", email: "", phone: "" });
    setContactOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.company_name.trim()) {
      addToast("Firmenname fehlt.", "error");
      return;
    }
    const includeContact = contactOpen && contact.first_name.trim().length > 0;
    startTransition(async () => {
      const res = await createCustomer({
        company_name: draft.company_name,
        website: draft.website || undefined,
        city: draft.city || undefined,
        vertical: draft.vertical || undefined,
        primaryContact: includeContact ? contact : null,
      });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Kunde angelegt.", "success");
      resetAndClose();
      router.push(`/fulfillment/kunden/${res.id}`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-primary-dark"
      >
        <Plus className="h-4 w-4" /> Neuer Kunde
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !pending && resetAndClose()}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Neuen Kunden anlegen</h2>
              <button type="button" onClick={resetAndClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">E-Mail und Telefon werden beim Ansprechpartner gepflegt.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Firmenname *" full>
                <input value={draft.company_name} onChange={(e) => setDraft({ ...draft, company_name: e.target.value })} className={inputCls} required autoFocus />
              </Field>
              <Field label="Website">
                <input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://…" className={inputCls} />
              </Field>
              <Field label="Stadt">
                <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Bereich" full>
                <select value={draft.vertical} onChange={(e) => setDraft({ ...draft, vertical: e.target.value as Vertical })} className={inputCls}>
                  <option value="">—</option>
                  <option value="webdesign">Webdesign</option>
                  <option value="recruiting">Recruiting</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
              </Field>
            </div>

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
                    <input value={contact.first_name} onChange={(e) => setContact({ ...contact, first_name: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="Nachname">
                    <input value={contact.last_name} onChange={(e) => setContact({ ...contact, last_name: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="Anrede">
                    <select value={contact.salutation} onChange={(e) => setContact({ ...contact, salutation: e.target.value as "du" | "sie" })} className={inputCls}>
                      <option value="sie">Sie</option>
                      <option value="du">Du</option>
                    </select>
                  </Field>
                  <Field label="Rolle">
                    <input value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} placeholder="z. B. Geschäftsführung" className={inputCls} />
                  </Field>
                  <Field label="E-Mail">
                    <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="Telefon">
                    <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={inputCls} />
                  </Field>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={pending} onClick={resetAndClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">
                Abbrechen
              </button>
              <button type="submit" disabled={pending} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50">
                {pending ? "Speichern…" : "Anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100";

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
