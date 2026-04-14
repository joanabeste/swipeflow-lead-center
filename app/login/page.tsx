"use client";

import { useState, useActionState } from "react";
import { loginWithPassword, sendMagicLink, sendPasswordReset } from "./actions";
import { Mail, Lock, KeyRound, ArrowLeft } from "lucide-react";
import { SwipeflowLogo } from "../(dashboard)/swipeflow-logo";

type Tab = "password" | "magic" | "reset";

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("password");

  const [pwState, pwAction, pwPending] = useActionState(loginWithPassword, undefined);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLink, undefined);
  const [rsState, rsAction, rsPending] = useActionState(sendPasswordReset, undefined);

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo + Titel */}
        <div className="flex flex-col items-center gap-4">
          <SwipeflowLogo className="h-12 w-auto text-gray-900 dark:text-white" />
          <h1 className="text-xl font-bold tracking-tight">Lead Center</h1>
        </div>

        {/* ─── Passwort vergessen: Erfolg ─── */}
        {tab === "reset" && rsState?.success && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
                <Mail className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="rounded-md bg-green-50 p-4 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Link zum Zurücksetzen gesendet!
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                Prüfen Sie Ihr E-Mail-Postfach und klicken Sie auf den Link.
              </p>
            </div>
            <button
              onClick={() => setTab("password")}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück zur Anmeldung
            </button>
          </div>
        )}

        {/* ─── Magic Link: Erfolg ─── */}
        {tab === "magic" && mlState?.success && (
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
                Prüfen Sie Ihr E-Mail-Postfach und klicken Sie auf den Link.
              </p>
            </div>
            <button
              onClick={() => setTab("password")}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück zur Anmeldung
            </button>
          </div>
        )}

        {/* ─── Formulare ─── */}
        {!((tab === "magic" && mlState?.success) || (tab === "reset" && rsState?.success)) && (
          <>
            {/* Tab-Auswahl (nur Passwort / Magic Link) */}
            {tab !== "reset" && (
              <div className="flex rounded-lg border border-gray-200 dark:border-[#2c2c2e]">
                <button
                  onClick={() => setTab("password")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-l-lg px-3 py-2 text-sm font-medium transition ${
                    tab === "password"
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Passwort
                </button>
                <button
                  onClick={() => setTab("magic")}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-r-lg px-3 py-2 text-sm font-medium transition ${
                    tab === "magic"
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Magic Link
                </button>
              </div>
            )}

            {/* ─── Passwort Login ─── */}
            {tab === "password" && (
              <form action={pwAction} className="space-y-4">
                {pwState?.error && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {pwState.error}
                  </div>
                )}
                <div>
                  <label htmlFor="pw-email" className="block text-sm font-medium">E-Mail</label>
                  <input
                    id="pw-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@firma.de"
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:placeholder-gray-500"
                  />
                </div>
                <div>
                  <label htmlFor="pw-password" className="block text-sm font-medium">Passwort</label>
                  <input
                    id="pw-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:placeholder-gray-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pwPending}
                  className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  {pwPending ? "Anmeldung…" : "Anmelden"}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("reset")}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Passwort vergessen?
                </button>
              </form>
            )}

            {/* ─── Magic Link ─── */}
            {tab === "magic" && (
              <form action={mlAction} className="space-y-4">
                {mlState?.error && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {mlState.error}
                  </div>
                )}
                <div>
                  <label htmlFor="ml-email" className="block text-sm font-medium">E-Mail</label>
                  <input
                    id="ml-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@firma.de"
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:placeholder-gray-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={mlPending}
                  className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  {mlPending ? "Wird gesendet…" : "Magic Link senden"}
                </button>
              </form>
            )}

            {/* ─── Passwort vergessen ─── */}
            {tab === "reset" && (
              <div className="space-y-4">
                <button
                  onClick={() => setTab("password")}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Zurück
                </button>
                <h2 className="text-lg font-semibold">Passwort zurücksetzen</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Geben Sie Ihre E-Mail ein. Sie erhalten einen Link zum Zurücksetzen.
                </p>
                <form action={rsAction} className="space-y-4">
                  {rsState?.error && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                      {rsState.error}
                    </div>
                  )}
                  <div>
                    <label htmlFor="rs-email" className="block text-sm font-medium">E-Mail</label>
                    <input
                      id="rs-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="name@firma.de"
                      className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={rsPending}
                    className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                  >
                    {rsPending ? "Wird gesendet…" : "Link senden"}
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
