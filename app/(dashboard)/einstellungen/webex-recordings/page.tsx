import { Mic } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../_components/ui";
import { WebexRecordingsManager } from "../_components/webex-recordings-manager";

export default async function WebexRecordingsPage() {
  const supabase = await createClient();
  const last24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [{ count: fetchedLast24h }, { count: pendingCount }] = await Promise.all([
    supabase.from("lead_calls").select("*", { count: "exact", head: true })
      .gte("recording_fetched_at", last24h),
    supabase.from("lead_calls").select("*", { count: "exact", head: true })
      .is("recording_url", null)
      .not("ended_at", "is", null)
      .gte("started_at", last24h),
  ]);

  const status = {
    hasToken: !!process.env.WEBEX_CALLING_TOKEN,
    fetchedLast24h: fetchedLast24h ?? 0,
    pendingCount: pendingCount ?? 0,
  };

  return (
    <div>
      <PageHeader
        icon={Mic}
        category="Integrationen"
        title="Aufzeichnungen (Webex Calling)"
        subtitle="Call-Recordings werden automatisch aus Webex abgeholt und den Calls im CRM zugeordnet."
      />
      <WebexRecordingsManager status={status} />
    </div>
  );
}
