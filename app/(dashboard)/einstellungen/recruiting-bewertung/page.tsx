import { Briefcase } from "lucide-react";
import { getRecruitingScoringConfig } from "@/lib/enrichment/recruiting-scoring";
import { PageHeader } from "../_components/ui";
import { RecruitingScoringForm } from "../_components/recruiting-scoring-form";

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
      <RecruitingScoringForm config={config} />
    </div>
  );
}
