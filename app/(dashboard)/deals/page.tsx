import { Banknote } from "lucide-react";
import { listDeals, listStages } from "@/lib/deals/server";
import { listTeamMembers } from "./actions";
import { DealsBoard } from "./deals-board";

export default async function DealsPage() {
  const [deals, stages, team] = await Promise.all([
    listDeals(),
    listStages(),
    listTeamMembers(),
  ]);

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Banknote className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deals</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Pipeline aller offenen Verkaufschancen mit Volumen und Status.
          </p>
        </div>
      </header>

      <DealsBoard deals={deals} stages={stages} team={team} />
    </div>
  );
}
