"use client";

import { useState, useTransition } from "react";
import { createManualEntry } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import { toDatetimeLocalValue } from "@/lib/zeit/format";

export function ManualEntryForm() {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const now = new Date();
  const earlier = new Date(now.getTime() - 60 * 60 * 1000);
  const [startedAt, setStartedAt] = useState(toDatetimeLocalValue(earlier));
  const [endedAt, setEndedAt] = useState(toDatetimeLocalValue(now));
  const [note, setNote] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createManualEntry({
        started_at: new Date(startedAt).toISOString(),
        ended_at: new Date(endedAt).toISOString(),
        note: note || null,
      });
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        addToast("Eintrag angelegt.", "success");
        setNote("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Manueller Eintrag</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Start">
          <input
            type="datetime-local"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
            required
          />
        </Field>
        <Field label="Ende">
          <input
            type="datetime-local"
            value={endedAt}
            onChange={(e) => setEndedAt(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
            required
          />
        </Field>
        <Field label="Notiz">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="optional"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100"
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Eintrag anlegen"}
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
