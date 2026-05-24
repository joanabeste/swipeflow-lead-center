"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, KeyRound, Check, Loader2 } from "lucide-react";
import type { Profile } from "@/lib/types";
import { createUser, updateUser, deleteUser, resetPassword } from "./actions";
import { PasswordInput } from "@/components/password-input";
import { useToastContext } from "../toast-provider";

interface Props {
  profiles: Profile[];
  currentUserId: string;
}

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  sales: "Vertrieb",
  viewer: "Betrachter",
  employee: "Mitarbeiter",
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function UserManager({ profiles, currentUserId }: Props) {
  const [state, formAction, pending] = useActionState(createUser, undefined);
  const { addToast } = useToastContext();
  const [saving, setSaving] = useState<Record<string, SaveState>>({});

  function setRow(id: string, s: SaveState) {
    setSaving((prev) => ({ ...prev, [id]: s }));
    if (s === "saved") {
      setTimeout(() => setSaving((prev) => ({ ...prev, [id]: "idle" })), 1500);
    }
  }

  async function applyUpdate(profileId: string, updates: Parameters<typeof updateUser>[1], label: string) {
    setRow(profileId, "saving");
    const res = await updateUser(profileId, updates);
    if (res && "error" in res && res.error) {
      setRow(profileId, "error");
      addToast(res.error, "error");
    } else {
      setRow(profileId, "saved");
      addToast(label, "success");
    }
  }

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
            <PasswordInput
              name="password"
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
              <option value="employee">Mitarbeiter</option>
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
              <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400" title="Vertrieb">Vert.</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400" title="Fulfillment">Fulf.</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400" title="Zeit & Lohn">Zeit</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400" title="Learning ansehen">Learn</th>
              <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400" title="Learning bearbeiten">L-Edit</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Erstellt</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-[#2c2c2e]">
            {profiles.map((profile) => {
              const rowState = saving[profile.id] ?? "idle";
              return (
              <tr key={profile.id} className={rowState === "saving" ? "bg-primary/[0.03]" : ""}>
                <td className="px-4 py-3 text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <span>{profile.name}</span>
                    <SaveIndicator state={rowState} />
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{profile.email}</td>
                <td className="px-4 py-3 text-sm">
                  <select
                    defaultValue={profile.role}
                    onChange={(e) => applyUpdate(profile.id, { role: e.target.value }, `Rolle gespeichert: ${roleLabels[e.target.value] ?? e.target.value}`)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    disabled={profile.id === currentUserId}
                  >
                    {Object.entries(roleLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-center">
                  <PermissionCheckbox
                    profile={profile}
                    field="can_vertrieb"
                    disabled={profile.role === "admin" || profile.id === currentUserId}
                    onSave={applyUpdate}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <PermissionCheckbox
                    profile={profile}
                    field="can_fulfillment"
                    disabled={profile.role === "admin" || profile.id === currentUserId}
                    onSave={applyUpdate}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <PermissionCheckbox
                    profile={profile}
                    field="can_zeit"
                    disabled={profile.role === "admin" || profile.id === currentUserId}
                    onSave={applyUpdate}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <PermissionCheckbox
                    profile={profile}
                    field="can_learning"
                    disabled={profile.role === "admin" || profile.id === currentUserId}
                    onSave={applyUpdate}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <PermissionCheckbox
                    profile={profile}
                    field="can_learning_edit"
                    disabled={profile.role === "admin" || profile.id === currentUserId}
                    onSave={applyUpdate}
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  <select
                    defaultValue={profile.status}
                    onChange={(e) => applyUpdate(profile.id, { status: e.target.value }, e.target.value === "active" ? "Aktiviert." : "Deaktiviert.")}
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
                    onClick={async () => {
                      const pw = prompt("Neues Passwort:");
                      if (!pw) return;
                      setRow(profile.id, "saving");
                      const res = await resetPassword(profile.id, pw);
                      if (res && "error" in res && res.error) {
                        setRow(profile.id, "error");
                        addToast(res.error, "error");
                      } else {
                        setRow(profile.id, "saved");
                        addToast("Passwort zurueckgesetzt.", "success");
                      }
                    }}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    title="Passwort zurücksetzen"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  {profile.id !== currentUserId && (
                    <button
                      onClick={async () => {
                        if (!confirm(`${profile.name} wirklich löschen?`)) return;
                        setRow(profile.id, "saving");
                        const res = await deleteUser(profile.id);
                        if (res && "error" in res && res.error) {
                          setRow(profile.id, "error");
                          addToast(res.error, "error");
                        } else {
                          addToast(`${profile.name} geloescht.`, "success");
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (state === "saved") return <Check className="h-3.5 w-3.5 text-green-500" />;
  if (state === "error") return <span className="text-xs font-bold text-red-500">!</span>;
  return null;
}

function PermissionCheckbox({
  profile,
  field,
  disabled,
  onSave,
}: {
  profile: Profile;
  field: "can_vertrieb" | "can_fulfillment" | "can_zeit" | "can_learning" | "can_learning_edit";
  disabled?: boolean;
  onSave: (profileId: string, updates: Parameters<typeof updateUser>[1], label: string) => Promise<void>;
}) {
  // Admins haben implizit alles — UI zeigt das als "haken+disabled".
  const initial = profile.role === "admin"
    ? true
    : (profile[field] ?? (field === "can_zeit" ? true : (field === "can_vertrieb" || field === "can_fulfillment") ? profile.role !== "employee" : false));
  const FIELD_LABELS: Record<typeof field, string> = {
    can_vertrieb: "Vertrieb",
    can_fulfillment: "Fulfillment",
    can_zeit: "Zeit & Lohn",
    can_learning: "Learning",
    can_learning_edit: "Learning-Bearbeitung",
  };
  return (
    <input
      type="checkbox"
      defaultChecked={initial}
      disabled={disabled}
      onChange={(e) => onSave(profile.id, { [field]: e.target.checked }, `${FIELD_LABELS[field]} ${e.target.checked ? "aktiviert" : "deaktiviert"}.`)}
      className="h-4 w-4 accent-primary disabled:opacity-50"
      title={disabled && profile.role === "admin" ? "Admins haben immer Zugriff" : ""}
    />
  );
}
