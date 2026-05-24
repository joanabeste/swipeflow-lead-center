"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import type { ProjectStatus } from "@/lib/fulfillment/types";
import { createProject } from "../../actions";
import { useToastContext } from "../../../toast-provider";

type CustomerOption = { id: string; name: string };

const initialDraft = () => ({
  name: "",
  vertical: "" as "" | "webdesign" | "recruiting" | "sonstiges",
  status: "onboarding" as ProjectStatus,
  started_at: new Date().toISOString().slice(0, 10),
  notes: "",
});

export function NewProjectButton({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(initialDraft());

  const filtered = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 50);
    return customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [customerQuery, customers]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!comboOpen) return;
    function onClick(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [comboOpen]);

  function resetAndClose() {
    setOpen(false);
    setCustomerId(null);
    setCustomerQuery("");
    setComboOpen(false);
    setDraft(initialDraft());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      addToast("Bitte Kunde auswaehlen.", "error");
      return;
    }
    if (!draft.name.trim()) {
      addToast("Projekt-Name fehlt.", "error");
      return;
    }
    startTransition(async () => {
      const res = await createProject({
        lead_id: customerId,
        name: draft.name,
        status: draft.status,
        vertical: draft.vertical || undefined,
        started_at: draft.started_at || undefined,
        notes: draft.notes || undefined,
      });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Projekt angelegt.", "success");
      resetAndClose();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark"
      >
        <Plus className="h-4 w-4" /> Neues Projekt
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) resetAndClose();
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Neues Projekt</h2>
              <button
                type="button"
                onClick={resetAndClose}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
                aria-label="Schliessen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Kunde *" full>
                  <div ref={comboRef} className="relative">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={customerQuery}
                        onChange={(e) => {
                          setCustomerQuery(e.target.value);
                          setCustomerId(null);
                          setComboOpen(true);
                        }}
                        onFocus={() => setComboOpen(true)}
                        placeholder="Kunde suchen…"
                        className={`${inputCls} pl-9`}
                        autoComplete="off"
                        required
                      />
                    </div>
                    {comboOpen && (
                      <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]">
                        {filtered.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-400">Kein Kunde gefunden.</div>
                        ) : (
                          filtered.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setCustomerId(c.id);
                                setCustomerQuery(c.name);
                                setComboOpen(false);
                              }}
                              className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5 ${
                                customerId === c.id ? "bg-primary/10" : ""
                              }`}
                            >
                              {c.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </Field>

                <Field label="Projekt-Name *" full>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className={inputCls}
                    required
                  />
                </Field>

                <Field label="Bereich">
                  <select
                    value={draft.vertical}
                    onChange={(e) =>
                      setDraft({ ...draft, vertical: e.target.value as "" | "webdesign" | "recruiting" | "sonstiges" })
                    }
                    className={inputCls}
                  >
                    <option value="">—</option>
                    <option value="webdesign">Webdesign</option>
                    <option value="recruiting">Recruiting</option>
                    <option value="sonstiges">Sonstiges</option>
                  </select>
                </Field>

                <Field label="Status">
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}
                    className={inputCls}
                  >
                    <option value="onboarding">Onboarding</option>
                    <option value="active">Aktiv</option>
                    <option value="paused">Pausiert</option>
                    <option value="completed">Abgeschlossen</option>
                  </select>
                </Field>

                <Field label="Start-Datum" full>
                  <input
                    type="date"
                    value={draft.started_at}
                    onChange={(e) => setDraft({ ...draft, started_at: e.target.value })}
                    className={inputCls}
                  />
                </Field>

                <Field label="Notiz" full>
                  <textarea
                    rows={3}
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
                >
                  {pending ? "Speichern…" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100";

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
