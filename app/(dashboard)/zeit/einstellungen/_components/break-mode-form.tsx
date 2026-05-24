"use client";

import { useState, useTransition } from "react";
import { updateOwnBreakMode } from "../actions";
import { useToastContext } from "../../../toast-provider";
import type { BreakMode } from "@/lib/types";

export function BreakModeForm({ initial }: { initial: BreakMode }) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<BreakMode>(initial);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateOwnBreakMode(mode);
      if ("error" in res) addToast(res.error, "error");
      else addToast("Pausen-Modus gespeichert.", "success");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Pausen-Modus</h3>
      <div className="mt-3 space-y-2">
        <Option value="manual" current={mode} onChange={setMode} title="Manuell" description="Du stoppst den Timer in deinen Pausen selbst. Empfohlen, wenn deine Pausen unterschiedlich liegen." />
        <Option value="auto_deduct" current={mode} onChange={setMode} title="Automatischer Abzug" description="Pflichtpausen nach §4 ArbZG (30 min ab 6h, 45 min ab 9h) werden automatisch abgezogen, soweit nicht bereits durch Luecken zwischen Eintraegen abgedeckt." />
      </div>
      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
        Hinweis: §4 ArbZG verpflichtet ab 6h Arbeitszeit zu 30 min, ab 9h zu 45 min Pause.
      </div>
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={pending} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark disabled:opacity-50">
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}

function Option({ value, current, onChange, title, description }: { value: BreakMode; current: BreakMode; onChange: (m: BreakMode) => void; title: string; description: string }) {
  const checked = value === current;
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${checked ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300 dark:border-[#2c2c2e]/60"}`}>
      <input type="radio" name="break-mode" value={value} checked={checked} onChange={() => onChange(value)} className="mt-0.5 h-4 w-4 accent-primary" />
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </label>
  );
}
