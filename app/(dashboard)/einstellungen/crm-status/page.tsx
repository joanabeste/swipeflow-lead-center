import { Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { CustomLeadStatus } from "@/lib/types";
import { PageHeader } from "../_components/ui";
import { CrmStatusManager } from "../crm-status-manager";

export default async function CrmStatusPage() {
  const supabase = await createClient();
  const { data: crmStatuses } = await supabase
    .from("custom_lead_statuses")
    .select("*")
    .order("display_order", { ascending: true });

  return (
    <div>
      <PageHeader
        icon={Tag}
        category="Organisation"
        title="CRM-Status / Vertriebsphasen"
        subtitle={`Frei konfigurierbare Status-Labels für den Sales-Workflow im CRM. Leads bekommen beim Qualifizieren automatisch den Status „Todo".`}
      />
      <CrmStatusManager statuses={(crmStatuses as CustomLeadStatus[]) ?? []} />
    </div>
  );
}
