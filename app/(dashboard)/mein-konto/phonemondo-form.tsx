"use client";

import { useActionState, useEffect } from "react";
import { PhoneCall, Check } from "lucide-react";
import { savePhonemondoExtension } from "./actions";
import { useToast } from "@/lib/use-toast";

export function PhonemondoForm({ extension }: { extension: string | null }) {
  const [state, formAction, pending] = useActionState(savePhonemondoExtension, undefined);
  const { addToast } = useToast();

  useEffect(() => {
    if (state?.success) addToast("Durchwahl gespeichert.", "success");
    if (state?.error) addToast(state.error, "error");
  }, [state, addToast]);

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[200px]">
        <label htmlFor="extension" className="block text-sm font-medium">
          PhoneMondo-Durchwahl
        </label>
        <input
          id="extension"
          name="extension"
          type="text"
          defaultValue={extension ?? ""}
          placeholder="z.B. 101"
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>
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
