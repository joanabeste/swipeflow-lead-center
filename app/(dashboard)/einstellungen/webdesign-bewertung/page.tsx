import { Globe } from "lucide-react";
import { getWebdevScoringConfig } from "@/lib/enrichment/webdev-scoring";
import { PageHeader } from "../_components/ui";
import { WebdevScoringForm } from "../_components/webdev-scoring-form";

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
      <WebdevScoringForm config={config} />
    </div>
  );
}
