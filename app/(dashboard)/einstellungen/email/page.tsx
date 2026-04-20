import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserSmtp } from "@/lib/email/user-credentials";
import { PageHeader } from "../_components/ui";
import { EmailSettingsCard } from "./email-settings-card";

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
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <EmailSettingsCard smtp={smtp} />
      </div>
    </div>
  );
}
