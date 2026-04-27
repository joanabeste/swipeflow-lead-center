import { Brain } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import type { ScoringSuggestion } from "@/lib/types";
import { PageHeader } from "../_components/ui";
import { SuggestionList } from "./_components/suggestion-list";

export const dynamic = "force-dynamic";

export default async function ScoringVorschlaegePage() {
  const db = createServiceClient();

  const { data: pending } = await db
    .from("scoring_suggestions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: history } = await db
    .from("scoring_suggestions")
    .select("*")
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div>
      <PageHeader
        icon={Brain}
        category="Qualifizierung"
        title="KI-Scoring-Vorschlaege"
        subtitle="Eine KI vergleicht regelmaessig gewonnene und aussortierte Leads und schlaegt Anpassungen an der Webdesign- und Recruiting-Bewertung vor. Du entscheidest, ob ein Vorschlag uebernommen wird."
      />
      <SuggestionList
        pending={(pending ?? []) as ScoringSuggestion[]}
        history={(history ?? []) as ScoringSuggestion[]}
      />
    </div>
  );
}
