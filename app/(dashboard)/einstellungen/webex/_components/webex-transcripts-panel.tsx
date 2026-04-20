"use client";

import { AlertCircle, Info } from "lucide-react";

export function WebexTranscriptsPanelBody({
  hasScope,
  transcribedLast24h,
  pendingCount,
  aiNotEnabledCount,
}: {
  hasScope: boolean;
  transcribedLast24h: number;
  pendingCount: number;
  aiNotEnabledCount: number;
}) {
  return (
    <div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Metric label="Transkribiert (24h)" value={transcribedLast24h} />
        <Metric label="Ausstehend" value={pendingCount} />
        <Metric
          label="AI Assistant inaktiv"
          value={aiNotEnabledCount}
          tone={aiNotEnabledCount > 0 ? "warn" : "default"}
        />
      </dl>

      {!hasScope && (
        <Hint tone="info" icon={Info}>
          Der gespeicherte Token hat den Scope <Code>spark-admin:transcripts_read</Code> nicht.
          Neuen Token in developer.webex.com mit diesem Scope erzeugen, um Transkripte zu holen.
        </Hint>
      )}
      {aiNotEnabledCount > 0 && (
        <Hint tone="warn" icon={AlertCircle}>
          Für mindestens einen Call meldet Webex „AI Assistant nicht aktiv“. Aktiviere den Webex AI
          Assistant unter{" "}
          <a href="https://admin.webex.com" target="_blank" rel="noreferrer" className="underline">
            admin.webex.com
          </a>{" "}
          → Services → Webex AI Assistant und stelle sicher, dass „Meeting/Call Summary“
          eingeschaltet ist.
        </Hint>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warn";
}) {
  const color = tone === "warn" && value > 0 ? "text-amber-600" : "";
  return (
    <div className="rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Hint({
  children,
  tone,
  icon: Icon,
}: {
  children: React.ReactNode;
  tone: "warn" | "info";
  icon: typeof AlertCircle;
}) {
  const toneClass =
    tone === "warn"
      ? "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
      : "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300";
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-md p-3 text-xs ${toneClass}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-white/60 px-1 font-mono text-[11px] dark:bg-black/20">
      {children}
    </code>
  );
}
