import { Trash2 } from "lucide-react";
import { PageHeader } from "../_components/ui";
import { listTrash } from "./actions";
import { TrashManager } from "./trash-manager";

export default async function PapierkorbPage() {
  const { leads, deals } = await listTrash();
  return (
    <div>
      <PageHeader
        icon={Trash2}
        category="Verwaltung"
        title="Papierkorb"
        subtitle="Gelöschte Firmen und Deals werden 30 Tage aufbewahrt. Danach werden sie endgültig entfernt. In der Zwischenzeit kannst du sie wiederherstellen oder sofort löschen."
      />
      <TrashManager leads={leads} deals={deals} />
    </div>
  );
}
