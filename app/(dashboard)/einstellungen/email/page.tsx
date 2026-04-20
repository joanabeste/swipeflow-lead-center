import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserSmtp } from "@/lib/email/user-credentials";
import { PageHeader } from "../_components/ui";
import { EmailSettingsCard } from "../_components/email-settings-card";

export default async function EmailSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const smtp = user ? await getUserSmtp(user.id) : null;

  return (
    <div>
      <PageHeader
        icon={Mail}
        category="Integrationen"
        title="E-Mail (SMTP)"
        subtitle="Deine persönlichen SMTP-Zugangsdaten für den Versand aus dem CRM."
      />
      <EmailSettingsCard smtp={smtp} />
    </div>
  );
}
