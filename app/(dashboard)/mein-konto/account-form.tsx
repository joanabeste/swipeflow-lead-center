"use client";

import { useActionState, useEffect } from "react";
import { Lock, Check } from "lucide-react";
import { changeMyPassword } from "./actions";
import { useToastContext } from "../toast-provider";

export function AccountForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, pending] = useActionState(changeMyPassword, undefined);
  const { addToast } = useToastContext();

  useEffect(() => {
    if (state?.success) addToast("Passwort erfolgreich geändert.", "success");
    if (state?.error) addToast(state.error, "error");
  }, [state, addToast]);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {hasPassword && (
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium">
            Aktuelles Passwort
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
          />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium">Neues Passwort</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Mindestens 8 Zeichen"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium">Passwort bestätigen</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Passwort wiederholen"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
      >
        {state?.success ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        {pending ? "Wird gespeichert…" : hasPassword ? "Passwort ändern" : "Passwort setzen"}
      </button>
    </form>
  );
}
