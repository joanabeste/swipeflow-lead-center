"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TrafficCone } from "lucide-react";
import { TRAFFIC_LIGHT_OPTIONS, type TrafficLightRating } from "@/lib/types";
import { setTrafficLightManual } from "../actions";
import { useToastContext } from "../../toast-provider";

interface Props {
  leadId: string;
  rating: TrafficLightRating | null;
  score: number | null;
  reason: string | null;
  source: "ai" | "manual" | "api" | null;
  ratedAt: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  ai: "KI-Bewertung",
  manual: "Manuell korrigiert",
  api: "Per API gesetzt",
};

export function LeadTrafficLightCard({ leadId, rating, score, reason, source, ratedAt }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState<TrafficLightRating | null>(rating);

  const active = current ? TRAFFIC_LIGHT_OPTIONS.find((o) => o.value === current) : null;

  function choose(next: TrafficLightRating) {
    if (next === current || pending) return;
    const prev = current;
    setCurrent(next); // optimistisch
    startTransition(async () => {
      const res = await setTrafficLightManual(leadId, next);
      if (res && "error" in res && res.error) {
        setCurrent(prev);
        addToast(`Fehler: ${res.error}`, "error");
      } else {
        addToast("Ampel aktualisiert", "success");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <TrafficCone className="h-4 w-4 text-primary" />
          Webdesign-Ampel
        </h3>
        {active ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${active.color}`}>
            <span className={`h-2 w-2 rounded-full ${active.dot}`} />
            {active.label}
            {score != null && <span className="opacity-60">· {score}</span>}
          </span>
        ) : (
          <span className="text-xs text-gray-400">Noch nicht bewertet</span>
        )}
      </div>

      {reason && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{reason}</p>
      )}

      {(source || ratedAt) && (
        <p className="mt-2 text-xs text-gray-400">
          {source ? SOURCE_LABELS[source] ?? source : null}
          {source && ratedAt ? " · " : null}
          {ratedAt ? new Date(ratedAt).toLocaleDateString("de-DE") : null}
        </p>
      )}

      {/* Manuelle Korrektur */}
      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-[#2c2c2e]">
        <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Manuell setzen</p>
        <div className="flex gap-1.5">
          {TRAFFIC_LIGHT_OPTIONS.map((o) => {
            const isActive = current === o.value;
            return (
              <button
                key={o.value}
                onClick={() => choose(o.value)}
                disabled={pending}
                className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  isActive
                    ? `${o.color} border-transparent`
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${o.dot}`} />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
