import { Megaphone } from "lucide-react";
import { PageHeader } from "../_components/ui";
import { listCaseStudies, listIndustries } from "@/lib/landing-pages/server";
import { IndustriesManager } from "./_components/industries-manager";
import { CaseStudiesManager } from "./_components/case-studies-manager";

export default async function LandingPagesSettingsPage() {
  const [industries, caseStudies] = await Promise.all([
    listIndustries(false),
    listCaseStudies(false),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Megaphone}
        category="Marketing"
        title="Landing Pages"
        subtitle="Branchen und Case Studies, die beim Erzeugen einer personalisierten Landing-Page aus dem CRM zur Auswahl stehen. Die Templates werden pro Landing-Page einmal gerendert und gespeichert, spätere Änderungen hier beeinflussen bereits versendete Links nicht."
      />
      <IndustriesManager industries={industries} />
      <CaseStudiesManager caseStudies={caseStudies} industries={industries.filter((i) => i.is_active)} />
    </div>
  );
}
