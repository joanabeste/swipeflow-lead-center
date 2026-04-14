"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import type { Lead } from "@/lib/types";
import { updateLead } from "../actions";

const fieldLabels: Record<string, string> = {
  company_name: "Firmenname",
  domain: "Domain",
  phone: "Telefon",
  email: "E-Mail",
  street: "Straße",
  city: "Ort",
  zip: "PLZ",
  state: "Bundesland",
  country: "Land",
  industry: "Branche",
  company_size: "Unternehmensgröße",
  legal_form: "Rechtsform",
  register_id: "Handelsregister-Nr.",
  website: "Website",
  career_page_url: "Karriereseite",
  description: "Beschreibung",
};

export { fieldLabels as leadFieldLabels };

export function LeadMasterDataForm({ lead }: { lead: Lead }) {
  async function handleSubmit(
    _prev: { error?: string; success?: boolean } | undefined,
    formData: FormData,
  ) {
    const updates: Record<string, string | null> = {};
    for (const key of Object.keys(fieldLabels)) {
      const raw = formData.get(key) as string | null;
      const trimmed = raw?.trim();
      updates[key] = trimmed ? trimmed : null;
    }
    return updateLead(lead.id, updates);
  }

  const [state, formAction, pending] = useActionState(handleSubmit, undefined);
  const editableFields = Object.keys(fieldLabels);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">Stammdaten</h2>
      {state?.error && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{state.error}</div>
      )}
      {state?.success && (
        <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">Gespeichert.</div>
      )}
      <form action={formAction} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {editableFields.map((key) => (
            <div key={key} className={key === "description" ? "sm:col-span-2" : ""}>
              <label htmlFor={key} className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                {fieldLabels[key]}
              </label>
              {key === "description" ? (
                <textarea
                  id={key}
                  name={key}
                  defaultValue={lead[key as keyof Lead] as string ?? ""}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              ) : (
                <input
                  id={key}
                  name={key}
                  type="text"
                  defaultValue={lead[key as keyof Lead] as string ?? ""}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {pending ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </form>
    </div>
  );
}
