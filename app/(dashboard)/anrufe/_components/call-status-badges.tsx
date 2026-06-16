import {
  AlertCircle, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play,
} from "lucide-react";
import type { ActiveCall } from "../_lib/types";
import { callStatusDisplay } from "@/lib/calls/status-display";

export function StatusDot({ label, color }: { label: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-white/5 dark:text-gray-300">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color || "#6b7280" }}
      />
      {label}
    </span>
  );
}

export function LastCallStatusPill({ status }: { status: string }) {
  const m = callStatusDisplay(status);
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${m.cls}`}>{m.label}</span>;
}

export function CallStatusBadge({ activeCall }: { activeCall: ActiveCall | null }) {
  if (!activeCall) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
        <Play className="h-3 w-3" />
        Bereit
      </span>
    );
  }
  const s = activeCall.status;
  const classes =
    s === "answered"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
      : s === "ringing" || s === "initiated"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        : s === "missed"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          : s === "failed"
            ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            : "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300";
  const Icon =
    s === "answered"
      ? PhoneIncoming
      : s === "missed"
        ? PhoneMissed
        : s === "failed"
          ? AlertCircle
          : PhoneOutgoing;
  const label =
    s === "initiated" || s === "ringing"
      ? "Verbinde…"
      : s === "answered"
        ? "Im Gespräch"
        : s === "missed"
          ? "Nicht erreicht"
          : s === "failed"
            ? "Fehlgeschlagen"
            : "Beendet";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
