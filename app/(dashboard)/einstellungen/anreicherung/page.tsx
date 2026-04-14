import { Sparkles } from "lucide-react";
import { getAllEnrichmentDefaults } from "@/lib/enrichment/defaults";
import { PageHeader } from "../_components/ui";
import { EnrichmentDefaultsCard } from "../_components/enrichment-defaults-card";

export default async function AnreicherungPage() {
  const enrichmentDefaults = await getAllEnrichmentDefaults();
  return (
    <div>
      <PageHeader
        icon={Sparkles}
        category="Qualifizierung"
        title="Standard-Anreicherungskriterien"
        subtitle="Welche Daten beim Anreichern standardmäßig gesucht werden — pro Service-Modus."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EnrichmentDefaultsCard mode="recruiting" label="Recruiting" config={enrichmentDefaults.recruiting} />
        <EnrichmentDefaultsCard mode="webdev" label="Webentwicklung" config={enrichmentDefaults.webdev} />
      </div>
    </div>
  );
}
