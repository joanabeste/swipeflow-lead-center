import { Banknote } from "lucide-react";
import { listStages } from "@/lib/deals/server";
import { PageHeader } from "../_components/ui";
import { DealStagesManager } from "../_components/deal-stages-manager";

export default async function DealStagesPage() {
  const stages = await listStages();
  return (
    <div>
      <PageHeader
        icon={Banknote}
        category="Organisation"
        title="Deal-Pipeline (CRM-Vertriebsphasen)"
        subtitle="Phasen im Vertriebsprozess — dieselben Status wie im CRM. Sie bilden die Kanban-Spalten der Deals, in der Reihenfolge, in der Deals durchwandern. Jede Phase hat einen Typ (offen / gewonnen / verloren)."
      />
      <DealStagesManager stages={stages} />
    </div>
  );
}
