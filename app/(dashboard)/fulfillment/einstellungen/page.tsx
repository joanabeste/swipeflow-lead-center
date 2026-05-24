import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { listAllProjects } from "@/lib/fulfillment/data";
import { ClickupTokenForm } from "./_components/clickup-token-form";
import { ClickupListMapper } from "./_components/clickup-list-mapper";

export default async function FulfillmentEinstellungenPage() {
  await requireAdmin();
  const db = createServiceClient();
  const { data: integration } = await db
    .from("app_integrations")
    .select("workspace_id, workspace_name, configured_at")
    .eq("provider", "clickup")
    .maybeSingle();
  const projects = await listAllProjects();

  // Mapper anzeigen, sobald ueberhaupt eine Integration existiert (Token verbunden).
  // Frueher war Bedingung workspace_id — das versteckte den Mapper, falls die
  // Workspace-ID beim Connect leer war (sie wird jetzt eh automatisch gefuellt).
  const isConfigured = !!integration;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Fulfillment-Einstellungen</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ClickUp-Integration und Listen-Mapping</p>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">ClickUp-Verbindung</h2>
        <ClickupTokenForm
          isConfigured={!!integration}
          workspaceId={integration?.workspace_id ?? null}
          workspaceName={integration?.workspace_name ?? null}
        />
      </section>

      {isConfigured && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Projekte ⇄ ClickUp-Listen</h2>
          <ClickupListMapper projects={projects} />
        </section>
      )}
    </div>
  );
}
