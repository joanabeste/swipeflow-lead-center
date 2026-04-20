"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, FileText, KeyRound, Mic, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WebexConnection } from "./webex-connection-panel";

export function WebexOverview({
  connection,
  recordings,
  transcripts,
  onOpenWizard,
  onScrollTo,
}: {
  connection: Extract<WebexConnection, { configured: true }>;
  recordings: { fetchedLast24h: number; pendingCount: number };
  transcripts: { transcribedLast24h: number; aiNotEnabledCount: number; hasScope: boolean };
  onOpenWizard: () => void;
  onScrollTo: (id: "connection" | "recordings" | "transcripts" | "calling") => void;
}) {
  // Einmalig beim Mount — Countdown ist approximativ, genauere Anzeige per Route-Refresh.
  const [now] = useState(() => Date.now());
  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt) : null;
  const expired = expiresAt ? expiresAt.getTime() < now : false;
  const expiringSoon = expiresAt ? !expired && expiresAt.getTime() - now < 2 * 3600_000 : false;
  const connectionOk = !expired && !connection.lastVerifyError;
  const hoursLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - now) / 3600_000)) : null;

  const recordingOk = connectionOk && recordings.pendingCount === 0;
  const recordingPartial = connectionOk && recordings.pendingCount > 0;

  const transcriptOk = transcripts.hasScope && transcripts.aiNotEnabledCount === 0;
  const transcriptMissingScope = !transcripts.hasScope;

  const callingOk = connection.scopes.includes("spark:calls_write");

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        icon={KeyRound}
        label="Verbindung"
        status={expired ? "error" : expiringSoon ? "warn" : connectionOk ? "ok" : "error"}
        valueText={
          expired
            ? "Abgelaufen"
            : connectionOk
            ? hoursLeft != null
              ? `Gültig · noch ${hoursLeft}h`
              : "Gültig"
            : connection.lastVerifyError ?? "Prüfung fehlgeschlagen"
        }
        actionLabel={expired ? "Token erneuern" : "Details"}
        onAction={expired ? onOpenWizard : () => onScrollTo("connection")}
      />
      <Tile
        icon={Mic}
        label="Aufzeichnungen"
        status={recordingOk ? "ok" : recordingPartial ? "warn" : "error"}
        valueText={
          connectionOk
            ? `${recordings.fetchedLast24h} heute · ${recordings.pendingCount} ausstehend`
            : "Inaktiv"
        }
        actionLabel="Details"
        onAction={() => onScrollTo("recordings")}
      />
      <Tile
        icon={FileText}
        label="Transkripte"
        status={transcriptOk ? "ok" : "warn"}
        valueText={
          transcriptMissingScope
            ? "Scope fehlt"
            : transcripts.aiNotEnabledCount > 0
            ? "AI Assistant inaktiv"
            : `${transcripts.transcribedLast24h} heute`
        }
        actionLabel={transcriptMissingScope ? "Token erneuern" : "Details"}
        onAction={transcriptMissingScope ? onOpenWizard : () => onScrollTo("transcripts")}
      />
      <Tile
        icon={Phone}
        label="Click-to-Call"
        status={callingOk ? "ok" : "warn"}
        valueText={callingOk ? "Aktiv" : "Scope fehlt"}
        actionLabel={callingOk ? "Details" : "Token erneuern"}
        onAction={callingOk ? () => onScrollTo("calling") : onOpenWizard}
      />
    </div>
  );
}

type Status = "ok" | "warn" | "error";

function Tile({
  icon: Icon,
  label,
  status,
  valueText,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  label: string;
  status: Status;
  valueText: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const StatusIcon = status === "ok" ? CheckCircle2 : AlertCircle;
  const statusColor =
    status === "ok"
      ? "text-emerald-500"
      : status === "warn"
      ? "text-amber-500"
      : "text-red-500";
  const accentBg =
    status === "ok"
      ? "bg-emerald-500"
      : status === "warn"
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e] dark:hover:border-[#3a3a3c]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accentBg}`} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
      </div>
      <p className="mt-2 text-sm font-semibold tabular-nums">{valueText}</p>
      <button
        onClick={onAction}
        className="mt-3 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
      >
        {actionLabel}
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}
