"use client";

import { useActionState } from "react";
import { Plus, Trash2, KeyRound } from "lucide-react";
import type { Profile } from "@/lib/types";
import { createUser, updateUser, deleteUser, resetPassword } from "./actions";

interface Props {
  profiles: Profile[];
  currentUserId: string;
}

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  sales: "Vertrieb",
  viewer: "Betrachter",
};

export function UserManager({ profiles, currentUserId }: Props) {
  const [state, formAction, pending] = useActionState(createUser, undefined);

  return (
    <div className="mt-6 space-y-6">
      {/* Neuen Nutzer anlegen */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h3 className="font-medium">Neuen Nutzer anlegen</h3>

        {state?.error && (
          <div className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {state.error}
          </div>
        )}

        <form action={formAction} className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">E-Mail</label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="w-36">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Passwort</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="w-36">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Rolle</label>
            <select
              name="role"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="admin">Administrator</option>
              <option value="sales">Vertrieb</option>
              <option value="viewer">Betrachter</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Anlegen
          </button>
        </form>
      </div>

      {/* Nutzerliste */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[#2c2c2e]">
          <thead className="bg-gray-50 dark:bg-[#232325]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">E-Mail</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Rolle</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Erstellt</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td className="px-4 py-3 text-sm font-medium">{profile.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{profile.email}</td>
                <td className="px-4 py-3 text-sm">
                  <select
                    defaultValue={profile.role}
                    onChange={(e) => updateUser(profile.id, { role: e.target.value })}
                    className="rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    disabled={profile.id === currentUserId}
                  >
                    {Object.entries(roleLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-sm">
                  <select
                    defaultValue={profile.status}
                    onChange={(e) => updateUser(profile.id, { status: e.target.value })}
                    className="rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    disabled={profile.id === currentUserId}
                  >
                    <option value="active">Aktiv</option>
                    <option value="inactive">Inaktiv</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  {new Date(profile.created_at).toLocaleDateString("de-DE")}
                </td>
                <td className="flex gap-2 px-4 py-3">
                  <button
                    onClick={() => {
                      const pw = prompt("Neues Passwort:");
                      if (pw) resetPassword(profile.id, pw);
                    }}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="Passwort zurücksetzen"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  {profile.id !== currentUserId && (
                    <button
                      onClick={() => {
                        if (confirm(`${profile.name} wirklich löschen?`)) {
                          deleteUser(profile.id);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      title="Nutzer löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
