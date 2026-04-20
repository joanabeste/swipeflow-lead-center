import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDeal, listStages, listDealChanges, listDealNotes } from "@/lib/deals/server";
import { listTeamMembers } from "../actions";
import { DealDetail } from "./deal-detail";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [deal, stages, team, changes, notes] = await Promise.all([
    getDeal(id),
    listStages(),
    listTeamMembers(),
    listDealChanges(id),
    listDealNotes(id),
  ]);

  if (!deal) notFound();

  return (
    <div>
      <Link
        href="/deals"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3 w-3" />
        Zurück zur Pipeline
      </Link>

      <DealDetail deal={deal} stages={stages} team={team} changes={changes} notes={notes} />
    </div>
  );
}
