import { Archive } from "lucide-react";
import { PageHeader } from "../_components/ui";
import { listArchivedLeads } from "./actions";
import { ArchiveManager } from "./archive-manager";

export default async function AussortierteLeadsPage() {
  const { leads } = await listArchivedLeads();
  return (
    <div>
      <PageHeader
        icon={Archive}
        category="Verwaltung"
        title="Aussortierte Leads"
        subtitle="Leads, die du als „Passt nicht“ markiert hast. Sie erscheinen weder unter „Neue Leads“ noch im CRM, bleiben aber dauerhaft erhalten — beim Import wird gegen sie geprüft, und die KI lernt aus ihnen, welche Leads nicht zu deinem Profil passen."
      />
      <ArchiveManager leads={leads} />
    </div>
  );
}
