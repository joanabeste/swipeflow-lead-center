import { Mail, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUserSmtp, getUserImap } from "@/lib/email/user-credentials";
import { PageHeader } from "../_components/ui";
import { EmailSettingsCard } from "./email-settings-card";
import { ImapSettingsCard } from "./imap-settings-card";

export default async function EmailSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const smtp = user ? await getUserSmtp(user.id) : null;
  const imap = user ? await getUserImap(user.id) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Mail}
        category="Integrationen"
        title="E-Mail (SMTP)"
        subtitle="Deine persönlichen SMTP-Zugangsdaten für den Versand aus dem CRM."
      />
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <EmailSettingsCard smtp={smtp} />
      </div>

      <div className="pt-2">
        <div className="mb-3 flex items-center gap-2">
          <Inbox className="h-4 w-4 text-gray-500" />
          <h2 className="text-base font-semibold">IMAP (Posteingang & Sync mit Thunderbird)</h2>
        </div>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          Wenn IMAP eingerichtet ist, liest das Tool deinen Posteingang + Sent-Ordner und zeigt den Verlauf pro Kunde an. Mails aus Thunderbird erscheinen automatisch, und Mails aus dem Tool landen in deinem Sent-Ordner (Thunderbird sieht sie).
        </p>
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          <ImapSettingsCard imap={imap} hasSmtp={!!smtp} />
        </div>
      </div>
    </div>
  );
}
