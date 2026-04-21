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
        title="Deal-Stages"
        subtitle="Phasen im Vertriebsprozess — in der Reihenfolge, in der Deals typischerweise durchwandern. Jede Stage hat einen Typ (offen / gewonnen / verloren)."
      />
      <DealStagesManager stages={stages} />
    </div>
  );
}
