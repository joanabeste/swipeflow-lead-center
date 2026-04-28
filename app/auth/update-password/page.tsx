"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePassword } from "@/app/login/actions";
import { Lock, Check } from "lucide-react";
import { SwipeflowLogo } from "@/app/(dashboard)/swipeflow-logo";
import { PasswordInput } from "@/components/password-input";

export default function UpdatePasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-white dark:bg-[#111113]">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-4">
          <SwipeflowLogo className="h-12 w-auto text-gray-900 dark:text-white" />
          <h1 className="text-xl font-bold tracking-tight">Neues Passwort setzen</h1>
        </div>

        {state?.success ? (
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="rounded-md bg-green-50 p-4 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Passwort erfolgreich geändert!
              </p>
            </div>
            <Link
              href="/"
              className="inline-block rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              Zum Lead Center
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {state.error}
              </div>
            )}
            <div>
              <label htmlFor="password" className="block text-sm font-medium">Neues Passwort</label>
              <PasswordInput
                id="password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Mindestens 8 Zeichen"
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium">Passwort bestätigen</label>
              <PasswordInput
                id="confirm"
                name="confirm"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Passwort wiederholen"
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <Lock className="h-3.5 w-3.5" />
              {pending ? "Wird gespeichert…" : "Passwort setzen"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
