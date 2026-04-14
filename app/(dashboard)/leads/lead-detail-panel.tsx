"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, AlertTriangle, RotateCcw } from "lucide-react";
import type { Lead, LeadChange, LeadStatus } from "@/lib/types";
import { updateLead } from "./actions";

const statusOptions: { value: string; label: string; color: string }[] = [
  { value: "imported", label: "Importiert", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "filtered", label: "Gefiltert", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { value: "cancelled", label: "Ausgeschlossen", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { value: "enrichment_pending", label: "Anreicherung", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "enriched", label: "Angereichert", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "qualified", label: "Qualifiziert", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "exported", label: "Exportiert", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

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
  description: "Beschreibung",
  status: "Status",
  enrichment_source: "Anreicherung",
};

interface Props {
  lead: Lead;
  changes: LeadChange[];
}

export function LeadDetailPanel({ lead, changes }: Props) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<LeadStatus>(lead.status);
  const [statusPending, startStatusTransition] = useTransition();

  function handleStatusChange(newStatus: LeadStatus) {
    setCurrentStatus(newStatus);
    startStatusTransition(async () => {
      await updateLead(lead.id, { status: newStatus });
    });
  }

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

  const editableFields = Object.keys(fieldLabels).filter(
    (k) => k !== "status",
  );

  const statusInfo = statusOptions.find((s) => s.value === currentStatus) ?? statusOptions[0];

  return (
    <div>
      <button
        onClick={() => router.push("/leads")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Liste
      </button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Formular */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{lead.company_name}</h2>
              <div className="flex items-center gap-2">
                <select
                  value={currentStatus}
                  onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                  disabled={statusPending}
                  className={`rounded-full px-3 py-1 text-xs font-medium border-0 focus:ring-2 focus:ring-primary focus:outline-none ${statusInfo.color} ${statusPending ? "opacity-50" : ""}`}
                >
                  {statusOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Erstellt:{" "}
              {new Date(lead.created_at).toLocaleDateString("de-DE")}
            </p>

            {/* Cancel/Blacklist Banner */}
            {(lead.cancel_reason || (lead.blacklist_hit && lead.blacklist_reason)) && (
              <div className="mt-4 flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                    {lead.status === "cancelled" ? "Automatisch ausgeschlossen" : "Blacklist-Treffer"}
                  </p>
                  <p className="mt-0.5 text-xs text-orange-700 dark:text-orange-400">
                    {lead.cancel_reason ?? lead.blacklist_reason}
                  </p>
                </div>
                {(lead.status === "cancelled" || lead.status === "filtered") && (
                  <button
                    onClick={() => handleStatusChange("imported")}
                    disabled={statusPending}
                    className="inline-flex items-center gap-1 rounded-md border border-orange-300 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/30"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Trotzdem fortfahren
                  </button>
                )}
              </div>
            )}

            {state?.error && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {state.error}
              </div>
            )}
            {state?.success && (
              <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                Lead erfolgreich aktualisiert.
              </div>
            )}

            <form action={formAction} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {editableFields.map((key) => (
                  <div key={key}>
                    <label
                      htmlFor={key}
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {fieldLabels[key]}
                    </label>
                    {key === "description" ? (
                      <textarea
                        id={key}
                        name={key}
                        defaultValue={lead[key as keyof Lead] as string ?? ""}
                        rows={3}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      />
                    ) : (
                      <input
                        id={key}
                        name={key}
                        type="text"
                        defaultValue={lead[key as keyof Lead] as string ?? ""}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
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
        </div>

        {/* Änderungshistorie */}
        <div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
            <h3 className="font-medium">Änderungshistorie</h3>
            {changes.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Noch keine Änderungen.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {changes.map((change) => (
                  <li
                    key={change.id}
                    className="border-l-2 border-gray-200 pl-3 text-sm dark:border-gray-700"
                  >
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      {fieldLabels[change.field_name] ?? change.field_name}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400">
                      <span className="line-through">
                        {change.old_value ?? "–"}
                      </span>{" "}
                      → {change.new_value ?? "–"}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(change.created_at).toLocaleString("de-DE")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
