import { Briefcase } from "lucide-react";
import { getRecruitingScoringConfig } from "@/lib/enrichment/recruiting-scoring";
import { PageHeader } from "../_components/ui";
import { RecruitingScoringForm } from "../_components/recruiting-scoring-form";
import { PendingSuggestionBanner } from "../_components/pending-suggestion-banner";
import { LearningSourceHint } from "../_components/learning-source-hint";

export default async function RecruitingBewertungPage() {
  const config = await getRecruitingScoringConfig();
  return (
    <div>
      <PageHeader
        icon={Briefcase}
        category="Qualifizierung"
        title="Recruiting-Bewertung"
        subtitle="Wann soll ein Lead im Recruiting-Modus automatisch als qualifiziert gelten?"
      />
      <PendingSuggestionBanner vertical="recruiting" />
      <LearningSourceHint vertical="recruiting" />
      <RecruitingScoringForm config={config} />
    </div>
  );
}
