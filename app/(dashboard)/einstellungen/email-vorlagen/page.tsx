import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listTemplates } from "@/lib/email/templates";
import { PageHeader } from "../_components/ui";
import { EmailTemplatesManager } from "../_components/email-templates-manager";

export default async function EmailTemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const templates = user ? await listTemplates(user.id) : [];

  return (
    <div>
      <PageHeader
        icon={FileText}
        category="Integrationen"
        title="E-Mail-Vorlagen"
        subtitle="Wiederverwendbare Vorlagen mit Variablen für den Versand aus dem CRM. Built-in: {{contact_name}}, {{contact_first_name}}, {{contact_role}}, {{company_name}}, {{sender_name}}. Eigene wie {{loom_url}} werden beim Senden manuell befüllt."
      />
      <EmailTemplatesManager templates={templates} />
    </div>
  );
}
