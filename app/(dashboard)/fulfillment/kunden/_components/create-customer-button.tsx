"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createCustomer } from "../actions";
import { useToastContext } from "../../../toast-provider";

export function CreateCustomerButton() {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ company_name: "", email: "", phone: "", website: "", city: "", vertical: "" as "" | "webdesign" | "recruiting" | "sonstiges" });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.company_name.trim()) {
      addToast("Firmenname fehlt.", "error");
      return;
    }
    startTransition(async () => {
      const res = await createCustomer({
        company_name: draft.company_name,
        email: draft.email || undefined,
        phone: draft.phone || undefined,
        website: draft.website || undefined,
        city: draft.city || undefined,
        vertical: draft.vertical || undefined,
      });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Kunde angelegt.", "success");
      setOpen(false);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !pending && setOpen(false)}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-[#2c2c2e]/50 dark:bg-[#161618]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Neuen Kunden anlegen</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">Der Kunde wird direkt als Kunde angelegt (Lifecycle skipping Lead/Deal).</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Firmenname *" full>
                <input value={draft.company_name} onChange={(e) => setDraft({ ...draft, company_name: e.target.value })} className={inputCls} required autoFocus />
              </Field>
              <Field label="E-Mail">
                <input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Telefon">
                <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Website">
                <input value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} placeholder="https://…" className={inputCls} />
              </Field>
              <Field label="Stadt">
                <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Bereich" full>
                <select value={draft.vertical} onChange={(e) => setDraft({ ...draft, vertical: e.target.value as "" | "webdesign" | "recruiting" | "sonstiges" })} className={inputCls}>
                  <option value="">—</option>
                  <option value="webdesign">Webdesign</option>
                  <option value="recruiting">Recruiting</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
              </Field>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">
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
