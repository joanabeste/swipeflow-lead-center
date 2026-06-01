import { Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { ProjectType } from "@/lib/fulfillment/types";
import { PageHeader } from "../_components/ui";
import { ProjectTypeManager } from "./project-type-manager";

export default async function ProjektTypenPage() {
  const supabase = await createClient();
  const { data: types } = await supabase
    .from("project_types")
    .select("*")
    .order("display_order", { ascending: true });

  return (
    <div>
      <PageHeader
        icon={Briefcase}
        category="Organisation"
        title="Projekt-Typen"
        subtitle="Definiere Projekt-Typen und welche Features sie aktivieren (Social Media, Tasks, E-Mails, Notizen). Jedes Projekt eines Kunden bekommt einen Typ — die Detailseite zeigt nur dessen Features."
      />
      <ProjectTypeManager types={(types as ProjectType[]) ?? []} />
    </div>
  );
}
