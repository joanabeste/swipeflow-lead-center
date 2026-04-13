"use client";

import { useActionState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import type { CancelRule } from "@/lib/types";
import { addCancelRule, toggleCancelRule, deleteCancelRule } from "./cancel-actions";

interface Props {
  rules: CancelRule[];
  filterCategory?: "import" | "enrichment";
}

const categoryLabels: Record<string, string> = {
  import: "Import",
  enrichment: "Anreicherung",
  both: "Beides",
};

const operatorLabels: Record<string, string> = {
  equals: "gleich",
  contains: "enthält",
  starts_with: "beginnt mit",
  in_list: "in Liste",
  greater_than: "größer als",
  less_than: "kleiner als",
  is_empty: "ist leer",
  is_not_empty: "ist nicht leer",
};

const fieldOptions = [
  { key: "company_name", label: "Firmenname" },
  { key: "legal_form", label: "Rechtsform" },
  { key: "company_size", label: "Unternehmensgröße" },
  { key: "industry", label: "Branche" },
  { key: "job_postings_count", label: "Anzahl Stellenanzeigen" },
  { key: "contacts_count", label: "Anzahl Kontakte" },
];

export function CancelRulesManager({ rules, filterCategory }: Props) {
  const [state, formAction, pending] = useActionState(addCancelRule, undefined);

  const filteredRules = filterCategory
    ? rules.filter((r) => r.category === filterCategory || r.category === "both")
    : rules;

  return (
    <div className="space-y-4">
      {/* Neue Regel */}
      <form action={formAction} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h4 className="text-sm font-medium">Neue Ausschlussregel erstellen</h4>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
            <input
              name="name"
              required
              placeholder="z.B. Konzerne ausschließen"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Beschreibung (optional)</label>
            <input
              name="description"
              placeholder="Warum diese Regel?"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Zeitpunkt</label>
            <select
              name="category"
              defaultValue={filterCategory ?? "both"}
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="import">Beim Import</option>
              <option value="enrichment">Nach Anreicherung</option>
              <option value="both">Beides</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Feld</label>
            <select
              name="field"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              {fieldOptions.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Operator</label>
            <select
              name="operator"
              className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              {Object.entries(operatorLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Wert</label>
            <input
              name="value"
              placeholder='z.B. 500 oder ["AG","SE"]'
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Erstellen
          </button>
        </div>

        {state?.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{state.error}</div>
        )}
      </form>

      {/* Regelliste */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[#2c2c2e]">
          <thead className="bg-gray-50 dark:bg-[#232325]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Zeitpunkt</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Bedingung</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Aktiv</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
            {filteredRules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Keine Ausschlussregeln vorhanden.
                </td>
              </tr>
            ) : (
              filteredRules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium">{rule.name}</p>
                    {rule.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{rule.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{categoryLabels[rule.category]}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {fieldOptions.find((f) => f.key === rule.field)?.label ?? rule.field}{" "}
                    {operatorLabels[rule.operator] ?? rule.operator}{" "}
                    {!["is_empty", "is_not_empty"].includes(rule.operator) && `"${rule.value}"`}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleCancelRule(rule.id, !rule.is_active)}>
                      {rule.is_active ? (
                        <ToggleRight className="h-5 w-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteCancelRule(rule.id)}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
