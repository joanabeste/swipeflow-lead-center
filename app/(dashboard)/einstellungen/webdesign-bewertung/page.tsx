import { Globe } from "lucide-react";
import { getWebdevScoringConfig } from "@/lib/enrichment/webdev-scoring";
import { PageHeader } from "../_components/ui";
import { WebdevScoringForm } from "../_components/webdev-scoring-form";
import { PendingSuggestionBanner } from "../_components/pending-suggestion-banner";

export default async function WebdesignBewertungPage() {
  const config = await getWebdevScoringConfig();
  return (
    <div>
      <PageHeader
        icon={Globe}
        category="Qualifizierung"
        title="Webdesign-Bewertung"
        subtitle="Strenge der KI-Bewertung und welche Kriterien als Issue zählen."
      />
      <PendingSuggestionBanner vertical="webdesign" />
      <WebdevScoringForm config={config} />
    </div>
  );
}
