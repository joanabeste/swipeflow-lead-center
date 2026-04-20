"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import type { CustomLeadStatus } from "@/lib/types";
import { updateCrmStatus } from "../actions";
import { useToastContext } from "../../toast-provider";

/**
 * Inline-Status-Dropdown für die CRM-Tabelle.
 *
 * Zeigt den aktuellen Status als Chip; bei Klick öffnet sich ein Popover
 * mit allen aktiven Status. Nach Auswahl wird `updateCrmStatus` gerufen
 * und die Seite refresht.
 */
export function InlineStatusDropdown({
  leadId,
  currentStatusId,
  statuses,
}: {
  leadId: string;
  currentStatusId: string | null;
  statuses: CustomLeadStatus[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { addToast } = useToastContext();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickAway(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const current = statuses.find((s) => s.id === currentStatusId);
  const color = current?.color ?? "#6b7280";
  const label = current?.label ?? "–";

  function handleSelect(nextId: string | null) {
    if (nextId === currentStatusId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await updateCrmStatus(leadId, nextId);
      if ("error" in res && res.error) {
        addToast(res.error, "error");
      } else {
        addToast("Status aktualisiert.", "success");
        router.refresh();
      }
      setOpen(false);
    });
  }

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium hover:ring-1 hover:ring-gray-300 disabled:opacity-50 dark:hover:ring-[#3a3a3c]"
        style={
          currentStatusId
            ? { backgroundColor: `${color}20`, color }
            : undefined
        }
      >
        {!currentStatusId && (
          <span className="text-gray-500 dark:text-gray-400">{label}</span>
        )}
        {currentStatusId && <span>{label}</span>}
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-60" />
        )}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-30 mt-1 min-w-[200px] rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
        >
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-white/5"
          >
            <span className="text-gray-500 dark:text-gray-400">Kein Status</span>
            {!currentStatusId && <Check className="h-3 w-3" />}
          </button>
          {statuses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s.id)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color || "#6b7280" }}
                />
                {s.label}
              </span>
              {s.id === currentStatusId && <Check className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
