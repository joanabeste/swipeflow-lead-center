import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDeal, listStages, listDealChanges, listDealNotes } from "@/lib/deals/server";
import { loadCrmDetail } from "@/lib/crm/load-crm-detail";
import { listTeamMembers } from "../actions";
import { DealDetail } from "./deal-detail";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // leadId ist erst nach dem Deal-Load bekannt → Deal zuerst awaiten, dann den Rest
  // (inkl. der Lead-Aktivität für die rechte Spalte) parallel laden.
  const deal = await getDeal(id);
  if (!deal) notFound();

  const [stages, team, changes, notes, leadBundle] = await Promise.all([
    listStages(),
    listTeamMembers(),
    listDealChanges(id),
    listDealNotes(id),
    deal.leadId ? loadCrmDetail(deal.leadId) : Promise.resolve(null),
  ]);

  const leadActivity = leadBundle
    ? {
        leadId: leadBundle.lead.id,
        leadPhone: leadBundle.lead.phone,
        companyName: leadBundle.lead.company_name,
        senderName: leadBundle.senderName,
        currentStatusId: leadBundle.lead.crm_status_id,
        statuses: leadBundle.statuses,
        contacts: leadBundle.contacts,
        notes: leadBundle.notes,
        calls: leadBundle.calls,
        emails: leadBundle.emails,
        enrichments: leadBundle.enrichments,
        changes: leadBundle.changes,
        auditLogs: leadBundle.auditLogs,
        callProviders: leadBundle.callProviders,
        importInfo: leadBundle.importInfo,
      }
    : null;

  return (
    <div>
      <Link
        href="/deals"
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-3 w-3" />
        Zurück zur Pipeline
      </Link>

      <DealDetail deal={deal} stages={stages} team={team} changes={changes} notes={notes} leadActivity={leadActivity} />
    </div>
  );
}
