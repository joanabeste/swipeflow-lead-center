"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { composeMailDraft } from "../../../mail-actions";
import { useToastContext } from "../../../../toast-provider";

type Tone = "freundlich" | "formal" | "kurz";

export function AiDraftButton({
  leadId,
  threadId,
  currentSubject,
  recipient,
  onDraft,
}: {
  leadId: string;
  threadId?: string | null;
  currentSubject?: string;
  recipient?: string;
  /** Wird mit Subject + Body aufgerufen. Subject ist optional (nur bei neuer Mail relevant). */
  onDraft: (draft: { subject: string; body: string }) => void;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [showOptions, setShowOptions] = useState(false);
  const [tone, setTone] = useState<Tone>("freundlich");
  const [intent, setIntent] = useState("");

  function trigger() {
    startTransition(async () => {
      const res = await composeMailDraft({
        leadId,
        threadId: threadId ?? null,
        recipient: recipient ?? null,
        subject: currentSubject ?? null,
        intent: intent.trim() || null,
        tone,
      });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      onDraft({ subject: res.subject, body: res.body });
      addToast("Entwurf erstellt — gerne nachbearbeiten.", "success");
      setShowOptions(false);
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => (showOptions ? trigger() : setShowOptions(true))}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
          title="KI-Entwurf basierend auf Kontext + deinem Stil"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {pending ? "Generiere…" : showOptions ? "Generieren" : "✨ Entwurf vorschlagen"}
        </button>
        {showOptions && !pending && (
          <button
            type="button"
            onClick={() => setShowOptions(false)}
            className="rounded-md px-1.5 py-1 text-[11px] text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>
      {showOptions && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            disabled={pending}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          >
            <option value="freundlich">Freundlich</option>
            <option value="formal">Formal</option>
            <option value="kurz">Kurz</option>
          </select>
          <input
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder={`Optional: Worum geht's? (z.B. „freundliche Erinnerung")`}
            disabled={pending}
            className="min-w-[220px] flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          />
        </div>
      )}
    </div>
  );
}
