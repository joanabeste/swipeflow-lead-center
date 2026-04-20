"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import type { Lead } from "@/lib/types";
import { updateLead } from "../../../leads/actions";
import { Card } from "./crm-shared";

const FIELD_LABELS: Record<string, string> = {
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
};
const EDIT_FIELDS = Object.keys(FIELD_LABELS);

export function CrmMasterdataForm({ lead }: { lead: Lead }) {
  async function handleSubmit(
    _prev: { error?: string; success?: boolean } | undefined,
    formData: FormData,
  ) {
    const updates: Record<string, string | null> = {};
    for (const key of EDIT_FIELDS) {
      const v = ((formData.get(key) as string) ?? "").trim();
      if (v !== (lead[key as keyof Lead] ?? "")) {
        updates[key] = v || null;
      }
    }
    if (Object.keys(updates).length === 0) return { success: true };
    return updateLead(lead.id, updates);
  }
  const [state, formAction, pending] = useActionState(handleSubmit, undefined);

  return (
    <Card>
      <details>
        <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          Stammdaten bearbeiten ▾
        </summary>
        <form action={formAction} className="mt-3 space-y-2">
          {EDIT_FIELDS.map((k) => (
            <label key={k} className="block text-xs">
              <span className="text-gray-500 dark:text-gray-400">{FIELD_LABELS[k]}</span>
              <input
                name={k}
                defaultValue={(lead[k as keyof Lead] as string) ?? ""}
                className="mt-0.5 w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
              />
            </label>
          ))}
          {state && "error" in state && state.error && (
            <p className="text-xs text-red-600">{state.error}</p>
          )}
          {state && "success" in state && state.success && (
            <p className="text-xs text-green-600">Gespeichert.</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            {pending ? "Speichern…" : "Speichern"}
          </button>
        </form>
      </details>
    </Card>
  );
}
