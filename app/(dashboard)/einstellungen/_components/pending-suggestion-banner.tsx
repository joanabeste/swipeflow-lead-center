import Link from "next/link";
import { Brain, ChevronRight } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import type { LeadVertical } from "@/lib/types";

export async function PendingSuggestionBanner({ vertical }: { vertical: LeadVertical }) {
  const db = createServiceClient();
  const { data } = await db
    .from("scoring_suggestions")
    .select("id, created_at, positive_sample_count, negative_sample_count")
    .eq("vertical", vertical)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return (
    <Link
      href="/einstellungen/scoring-vorschlaege"
      className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 transition hover:bg-primary/10 dark:bg-primary/10"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Brain className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="text-sm font-medium">KI hat einen Anpassungsvorschlag</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Basierend auf {data.positive_sample_count} positiven und{" "}
            {data.negative_sample_count} negativen Lead-Stichproben. Klicken zum Reviewen.
          </p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
    </Link>
  );
}
