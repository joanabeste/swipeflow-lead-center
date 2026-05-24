import { Coins } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import type { CommissionRule, CustomLeadStatus, Profile } from "@/lib/types";
import { ProvisionenManager } from "../../einstellungen/provisionen/provisionen-manager";

export default async function AdminProvisionenPage() {
  await requireAdmin();
  const db = createServiceClient();

  const [{ data: rulesData }, { data: statusesData }, { data: profilesData }] = await Promise.all([
    db.from("commission_rules").select("*").order("created_at", { ascending: false }),
    db.from("custom_lead_statuses").select("*").eq("is_active", true).order("display_order", { ascending: true }),
    db.from("profiles").select("id, name, email, role, hourly_wage_cents").eq("status", "active").order("name", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-white">
          <Coins className="h-6 w-6 text-primary" />
          Provisionen & Loehne
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Lege Provisions-Regeln fest (Trigger-Status, Betrag, Empfaenger) und pflege die Stundenloehne der Mitarbeiter.
        </p>
      </div>
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
