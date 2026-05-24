"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { updateCustomer, type UpdateCustomerInput } from "../../actions";
import { useToastContext } from "../../../../toast-provider";

interface CustomerInitial {
  id: string;
  company_name: string;
  website: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
}

export function EditCustomerButton({ customer }: { customer: CustomerInitial }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:text-gray-200 dark:hover:bg-white/5"
      >
        <Pencil className="h-3.5 w-3.5" /> Bearbeiten
      </button>
      {open && <EditCustomerDialog customer={customer} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditCustomerDialog({ customer, onClose }: { customer: CustomerInitial; onClose: () => void }) {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<UpdateCustomerInput>({
    company_name: customer.company_name,
    website: customer.website,
    street: customer.street,
    zip: customer.zip,
    city: customer.city,
  });

  function set<K extends keyof UpdateCustomerInput>(key: K, value: UpdateCustomerInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateCustomer(customer.id, form);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Kunde aktualisiert.", "success");
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-[#2c2c2e] dark:bg-[#161618]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Kunde bearbeiten</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Stammdaten anpassen. Kontakte separat unter „Kontakte".</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Firmenname *" className="sm:col-span-2">
            <input value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} required className={input} />
          </Field>
          <Field label="Website" className="sm:col-span-2">
            <input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://…" className={input} />
          </Field>
          <Field label="Straße" className="sm:col-span-2">
            <input value={form.street ?? ""} onChange={(e) => set("street", e.target.value)} className={input} />
          </Field>
          <Field label="PLZ">
            <input value={form.zip ?? ""} onChange={(e) => set("zip", e.target.value)} className={input} />
          </Field>
          <Field label="Ort">
            <input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} className={input} />
          </Field>

          <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={onClose} disabled={pending} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">
              Abbrechen
            </button>
            <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50">
              {pending ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const input = "w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}
