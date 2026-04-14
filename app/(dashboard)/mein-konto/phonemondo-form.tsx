"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { PhoneCall, Check, RefreshCw } from "lucide-react";
import type { PhonemondoSource } from "@/lib/phonemondo/types";
import { fetchMyPhonemondoSources, savePhonemondoExtension } from "./actions";
import { useToast } from "@/lib/use-toast";

export function PhonemondoForm({ extension }: { extension: string | null }) {
  const [state, formAction, pending] = useActionState(savePhonemondoExtension, undefined);
  const { addToast } = useToast();
  const [sources, setSources] = useState<PhonemondoSource[] | null>(null);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (state?.success) addToast("Source gespeichert.", "success");
    if (state?.error) addToast(state.error, "error");
  }, [state, addToast]);

  function loadSources() {
    startLoading(async () => {
      const res = await fetchMyPhonemondoSources();
      if (res.success) {
        setSources(res.sources);
        if (res.sources.length === 0) addToast("Keine Sources im Account gefunden.", "info");
      } else {
        addToast(res.error, "error");
      }
    });
  }

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <div className="flex items-end gap-2">
        <label htmlFor="extension" className="flex-1 min-w-[200px]">
          <span className="block text-sm font-medium">PhoneMondo-Source (UID)</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Die UID deines Telefons/Geräts im PhoneMondo-Account.
          </span>
          <input
            id="extension"
            name="extension"
            type="text"
            defaultValue={extension ?? ""}
            placeholder="UID aus deinem PhoneMondo-Dashboard"
            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
          />
        </label>
        <button
          type="button"
          onClick={loadSources}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5 disabled:opacity-50"
          title="Meine Sources aus PhoneMondo laden"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Lädt…" : "Sources laden"}
        </button>
      </div>

      {sources && sources.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Deine Sources (klicken zum Übernehmen):</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <button
                key={s.uid}
                type="button"
                onClick={() => {
                  const input = document.getElementById("extension") as HTMLInputElement | null;
                  if (input) input.value = s.uid;
                }}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs hover:border-primary hover:text-primary dark:border-[#2c2c2e] dark:bg-[#232325]"
                title={s.uid}
              >
                {s.label || s.uid}
                {s.deviceLabel && <span className="ml-1 text-gray-400">· {s.deviceLabel}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
      >
        {state?.success ? <Check className="h-3.5 w-3.5" /> : <PhoneCall className="h-3.5 w-3.5" />}
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
