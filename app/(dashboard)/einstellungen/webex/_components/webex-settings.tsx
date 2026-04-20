"use client";

import { useState } from "react";
import { FileText, KeyRound, Mic, Phone } from "lucide-react";
import { CollapsibleCard } from "./collapsible-card";
import { WebexConnectionPanelBody, type WebexConnection } from "./webex-connection-panel";
import { WebexRecordingsPanelBody } from "./webex-recordings-panel";
import { WebexTranscriptsPanelBody } from "./webex-transcripts-panel";
import { WebexCallingPanelBody } from "./webex-calling-panel";
import { WebexSetupWizard } from "./webex-setup-wizard";
import { WebexEmptyState } from "./webex-empty-state";
import { WebexOverview } from "./webex-overview";

type PanelKey = "connection" | "recordings" | "transcripts" | "calling";

export function WebexSettings({
  connection,
  recordings,
  transcripts,
}: {
  connection: WebexConnection;
  recordings: { fetchedLast24h: number; pendingCount: number };
  transcripts: { transcribedLast24h: number; pendingTranscripts: number; aiNotEnabledCount: number };
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [openPanels, setOpenPanels] = useState<Record<PanelKey, boolean>>(() =>
    computeAutoOpen(connection, transcripts),
  );

  function togglePanel(key: PanelKey) {
    setOpenPanels((s) => ({ ...s, [key]: !s[key] }));
  }

  function focusPanel(key: PanelKey) {
    setOpenPanels((s) => ({ ...s, [key]: true }));
    // Nach dem Re-Render in die Sicht scrollen.
    requestAnimationFrame(() => {
      document.getElementById(`webex-panel-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (!connection.configured) {
    return (
      <>
        <WebexEmptyState onStart={() => setWizardOpen(true)} />
        {wizardOpen && <WebexSetupWizard onClose={() => setWizardOpen(false)} />}
      </>
    );
  }

  const hasCallingScope = connection.scopes.includes("spark:calls_write");
  const hasTranscriptsScope = connection.scopes.includes("spark-admin:transcripts_read");

  return (
    <div className="space-y-5">
      <WebexOverview
        connection={connection}
        recordings={recordings}
        transcripts={{
          transcribedLast24h: transcripts.transcribedLast24h,
          aiNotEnabledCount: transcripts.aiNotEnabledCount,
          hasScope: hasTranscriptsScope,
        }}
        onOpenWizard={() => setWizardOpen(true)}
        onScrollTo={focusPanel}
      />

      <div className="space-y-3">
        <CollapsibleCard
          id="webex-panel-connection"
          icon={KeyRound}
          title="Verbindung"
          subtitle="Token, Gültigkeit und Scopes"
          badge={
            connection.source === "env" ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                Env-Var (Legacy)
              </span>
            ) : undefined
          }
          open={openPanels.connection}
          onToggle={() => togglePanel("connection")}
        >
          <WebexConnectionPanelBody
            connection={connection}
            onOpenWizard={() => setWizardOpen(true)}
          />
        </CollapsibleCard>

        <CollapsibleCard
          id="webex-panel-recordings"
          icon={Mic}
          title="Aufzeichnungen"
          subtitle="Automatischer Sync alle 2 Minuten"
          open={openPanels.recordings}
          onToggle={() => togglePanel("recordings")}
        >
          <WebexRecordingsPanelBody
            hasToken={connection.configured}
            fetchedLast24h={recordings.fetchedLast24h}
            pendingCount={recordings.pendingCount}
          />
        </CollapsibleCard>

        <CollapsibleCard
          id="webex-panel-transcripts"
          icon={FileText}
          title="Transkripte"
          subtitle="Text-Mitschrift per AI Assistant"
          open={openPanels.transcripts}
          onToggle={() => togglePanel("transcripts")}
        >
          <WebexTranscriptsPanelBody
            hasScope={hasTranscriptsScope}
            transcribedLast24h={transcripts.transcribedLast24h}
            pendingCount={transcripts.pendingTranscripts}
            aiNotEnabledCount={transcripts.aiNotEnabledCount}
          />
        </CollapsibleCard>

        <CollapsibleCard
          id="webex-panel-calling"
          icon={Phone}
          title="Click-to-Call"
          subtitle="Anrufe direkt aus dem CRM"
          open={openPanels.calling}
          onToggle={() => togglePanel("calling")}
        >
          <WebexCallingPanelBody hasScope={hasCallingScope} />
        </CollapsibleCard>
      </div>

      {wizardOpen && <WebexSetupWizard onClose={() => setWizardOpen(false)} />}
    </div>
  );
}

/** Panels mit offenen Issues initial aufklappen, der Rest bleibt kollabiert. */
function computeAutoOpen(
  connection: WebexConnection,
  transcripts: { aiNotEnabledCount: number },
): Record<PanelKey, boolean> {
  if (!connection.configured) {
    return { connection: false, recordings: false, transcripts: false, calling: false };
  }
  const now = Date.now();
  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt).getTime() : null;
  const expired = expiresAt ? expiresAt < now : false;
  const hasError = !!connection.lastVerifyError;
  const missingTranscripts = !connection.scopes.includes("spark-admin:transcripts_read");
  const missingCalling = !connection.scopes.includes("spark:calls_write");
  const aiDisabled = transcripts.aiNotEnabledCount > 0;

  return {
    connection: expired || hasError,
    recordings: false,
    transcripts: (missingTranscripts || aiDisabled) && !expired,
    calling: missingCalling && !expired,
  };
}
