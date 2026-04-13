"use client";

import { useActionState } from "react";
import { sendMagicLink } from "./actions";
import { Mail } from "lucide-react";
import { SwipeflowLogo } from "../(dashboard)/swipeflow-logo";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(sendMagicLink, undefined);

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <SwipeflowLogo className="h-10 w-auto text-gray-900 dark:text-white" />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Lead Center</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              swipeflow GmbH
            </p>
          </div>
        </div>

        {state?.success ? (
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
                <Mail className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="rounded-md bg-green-50 p-4 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Magic Link gesendet!
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                Prüfen Sie Ihr E-Mail-Postfach und klicken Sie auf den Link, um sich anzumelden.
              </p>
            </div>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            {state?.error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {state.error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@swipeflow.de"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {pending ? "Wird gesendet…" : "Magic Link senden"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
