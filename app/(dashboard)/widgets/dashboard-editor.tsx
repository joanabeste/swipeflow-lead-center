"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings, X, ChevronUp, ChevronDown, Check, RotateCcw } from "lucide-react";
import { WIDGET_REGISTRY, defaultWidgetOrder } from "./registry";
import { saveDashboardWidgets } from "./actions";
import { useToastContext } from "../toast-provider";
import type { ServiceMode } from "@/lib/types";

interface Props {
  initialOrder: string[];
  serviceMode: ServiceMode;
}

export function DashboardEditor({ initialOrder, serviceMode }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e] dark:text-gray-400 dark:hover:bg-white/5"
      >
        <Settings className="h-3.5 w-3.5" />
        Dashboard anpassen
      </button>
      {open && (
        <Modal
          initialOrder={initialOrder}
          serviceMode={serviceMode}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Modal({
  initialOrder, serviceMode, onClose,
}: { initialOrder: string[]; serviceMode: ServiceMode; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<string[]>(initialOrder);

  const available = WIDGET_REGISTRY.filter(
    (w) => !w.serviceMode || w.serviceMode === serviceMode,
  );
  const inactive = available.filter((w) => !active.includes(w.key));

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= active.length) return;
    const next = [...active];
    [next[index], next[target]] = [next[target], next[index]];
    setActive(next);
  }
  function remove(key: string) { setActive(active.filter((k) => k !== key)); }
  function add(key: string) { setActive([...active, key]); }
  function resetDefaults() { setActive(defaultWidgetOrder(serviceMode)); }

  function save() {
    startTransition(async () => {
      const res = await saveDashboardWidgets(active);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Dashboard gespeichert", "success");
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <h2 className="text-lg font-semibold">Dashboard anpassen</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Aktive Widgets — Reihenfolge
            </h3>
            <ul className="mt-2 space-y-1.5">
              {active.length === 0 && (
                <li className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400 dark:border-[#2c2c2e]">
                  Keine Widgets aktiv — füge unten welche hinzu oder nutze &bdquo;Standard wiederherstellen&ldquo;.
                </li>
              )}
              {active.map((key, i) => {
                const meta = WIDGET_REGISTRY.find((w) => w.key === key);
                if (!meta) return null;
                return (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2.5 dark:border-[#2c2c2e] dark:bg-[#232325]"
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-white/5"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === active.length - 1}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-white/5"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
                    </div>
                    <button
                      onClick={() => remove(key)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      title="Entfernen"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {inactive.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Weitere Widgets
              </h3>
              <ul className="mt-2 space-y-1.5">
                {inactive.map((w) => (
                  <li
                    key={w.key}
                    className="flex items-center gap-2 rounded-md border border-dashed border-gray-200 p-2.5 dark:border-[#2c2c2e]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{w.label}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{w.description}</p>
                    </div>
                    <button
                      onClick={() => add(w.key)}
                      className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark"
                    >
                      + Hinzufügen
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <button
            onClick={resetDefaults}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <RotateCcw className="h-3 w-3" />
            Standard wiederherstellen
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {pending ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
