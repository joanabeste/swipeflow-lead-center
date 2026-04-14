import { ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { RequiredFieldProfile } from "@/lib/types";
import { PageHeader } from "../_components/ui";
import { FieldProfilesCard } from "../_components/field-profiles-card";

export default async function PflichtfelderPage() {
  const supabase = await createClient();
  const { data: fieldProfiles } = await supabase
    .from("required_field_profiles")
    .select("*")
    .order("name");

  return (
    <div>
      <PageHeader
        icon={ListChecks}
        category="Qualifizierung"
        title="Pflichtfeld-Profile"
        subtitle="Welche Felder müssen gefüllt sein, damit ein Lead qualifiziert werden kann?"
      />
      <FieldProfilesCard profiles={(fieldProfiles as RequiredFieldProfile[]) ?? []} />
    </div>
  );
}
