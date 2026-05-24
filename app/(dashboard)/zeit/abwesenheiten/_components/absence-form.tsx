"use client";

import { useState, useTransition } from "react";
import { createAbsence } from "../actions";
import { useToastContext } from "../../../toast-provider";
import type { AbsenceType } from "@/lib/zeit/types";

export function AbsenceForm() {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<AbsenceType>("vacation");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createAbsence({ type, date_from: from, date_to: to, note: note || null });
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Antrag gestellt.", "success");
        setNote("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Neuen Antrag stellen</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Field label="Art">
          <select value={type} onChange={(e) => setType(e.target.value as AbsenceType)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100">
            <option value="vacation">Urlaub</option>
            <option value="sick">Krank</option>
            <option value="other">Sonstiges</option>
          </select>
        </Field>
        <Field label="Von">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100" required />
        </Field>
        <Field label="Bis">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100" required />
        </Field>
        <Field label="Notiz">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100" />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={pending} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-primary-dark disabled:opacity-50">
          {pending ? "Senden…" : "Antrag stellen"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
