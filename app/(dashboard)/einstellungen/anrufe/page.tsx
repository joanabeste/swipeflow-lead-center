import { PhoneOutgoing } from "lucide-react";
import { getCallQueueSettings } from "@/lib/app-settings";
import { PageHeader } from "../_components/ui";
import { CallQueueSettingsCard } from "../_components/call-queue-settings-card";

export default async function AnrufeSettingsPage() {
  const settings = await getCallQueueSettings();
  return (
    <div>
      <PageHeader
        icon={PhoneOutgoing}
        category="Integrationen"
        title="Auto-Dialer"
        subtitle="Zeit-Einstellungen für die automatische Anruf-Queue unter /anrufe."
      />
      <CallQueueSettingsCard settings={settings} />
    </div>
  );
}
