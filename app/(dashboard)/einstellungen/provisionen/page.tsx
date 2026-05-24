import { Coins } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CommissionRule, CustomLeadStatus, Profile } from "@/lib/types";
import { PageHeader } from "../_components/ui";
import { ProvisionenManager } from "./provisionen-manager";

export default async function ProvisionenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const db = createServiceClient();

  const { data: me } = await db
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (me?.role !== "admin") {
    return (
      <div>
        <PageHeader
          icon={Coins}
          category="Vertrieb"
          title="Provisionen"
          subtitle="Nur Administratoren."
        />
      </div>
    );
  }

  const [{ data: rulesData }, { data: statusesData }, { data: profilesData }] = await Promise.all([
    db.from("commission_rules").select("*").order("created_at", { ascending: false }),
    db
      .from("custom_lead_statuses")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    db
      .from("profiles")
      .select("id, name, email, role, hourly_wage_cents")
      .eq("status", "active")
      .order("name", { ascending: true }),
  ]);

  return (
    <div>
      <PageHeader
        icon={Coins}
        category="Vertrieb"
        title="Provisionen"
        subtitle="Lege fest, wer wann wie viel Provision bekommt. Auslöser ist ein erreichter CRM-Status auf einem Lead, dem ein Mitarbeiter zugewiesen ist."
      />
      <ProvisionenManager
        rules={(rulesData as CommissionRule[]) ?? []}
        statuses={(statusesData as CustomLeadStatus[]) ?? []}
        profiles={
          (profilesData as Pick<Profile, "id" | "name" | "email" | "role" | "hourly_wage_cents">[]) ?? []
        }
      />
    </div>
  );
}
