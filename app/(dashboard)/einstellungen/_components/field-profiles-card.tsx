"use client";

import { useActionState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { leadFields } from "@/lib/csv/lead-fields";
import type { RequiredFieldProfile } from "@/lib/types";
import { saveFieldProfile, deleteFieldProfile } from "../actions";
import { Card } from "./ui";

export function FieldProfilesCard({ profiles }: { profiles: RequiredFieldProfile[] }) {
  const [state, formAction, pending] = useActionState(saveFieldProfile, undefined);

  return (
    <div className="space-y-4">
      <Card>
        <form action={formAction} className="space-y-5">
          {state?.error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{state.error}</div>
          )}
          <div>
            <label className="block text-sm font-medium">Profilname</label>
            <input
              name="name"
              required
              placeholder="z.B. Standard oder Branche-GaLaBau"
              className="mt-1.5 w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Pflichtfelder</label>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              {leadFields.map((field) => (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="fields"
                    value={field.key}
                    defaultChecked={field.key === "company_name"}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_default" className="rounded border-gray-300 dark:border-gray-600" />
            Als Standard-Profil setzen
          </label>
          <div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <Plus className="h-4 w-4" />
              {pending ? "Speichern…" : "Profil speichern"}
            </button>
          </div>
        </form>
      </Card>

      {profiles.length > 0 && (
        <Card>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Bestehende Profile ({profiles.length})
          </h3>
          <div className="mt-3 divide-y divide-gray-100 dark:divide-[#2c2c2e]">
            {profiles.map((fp) => (
              <div key={fp.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">
                    {fp.name}
                    {fp.is_default && (
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Standard
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {fp.required_fields.join(", ")}
                  </p>
                </div>
                <button
                  onClick={() => deleteFieldProfile(fp.id)}
                  className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  title="Profil löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
