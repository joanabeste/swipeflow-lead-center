import { Mic } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../_components/ui";
import { WebexSettings } from "./_components/webex-settings";
import { getWebexCredentials } from "@/lib/webex/auth";

export default async function WebexSettingsPage() {
  const supabase = await createClient();
  // Server Component — einmalig pro Request, Date.now() pragmatisch OK.
  // eslint-disable-next-line react-hooks/purity
  const last24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [{ count: fetchedLast24h }, { count: pendingCount }, { count: transcribedLast24h }, { count: pendingTranscripts }, { count: aiNotEnabledCount }, creds] =
    await Promise.all([
      supabase.from("lead_calls").select("*", { count: "exact", head: true })
        .gte("recording_fetched_at", last24h),
      supabase.from("lead_calls").select("*", { count: "exact", head: true })
        .is("recording_url", null)
        .not("ended_at", "is", null)
        .gte("started_at", last24h),
      supabase.from("lead_calls").select("*", { count: "exact", head: true })
        .gte("transcript_fetched_at", last24h),
      supabase.from("lead_calls").select("*", { count: "exact", head: true })
        .is("transcript_id", null)
        .not("recording_url", "is", null)
        .gte("started_at", last24h),
      supabase.from("lead_calls").select("*", { count: "exact", head: true })
        .ilike("transcript_fetch_error", "%AI Assistant%")
        .gte("started_at", last24h),
      getWebexCredentials(),
    ]);

  const connection = creds
    ? {
        configured: true as const,
        source: creds.source,
        expiresAt: creds.expiresAt?.toISOString() ?? null,
        scopes: creds.scopes,
        lastVerifiedAt: creds.lastVerifiedAt?.toISOString() ?? null,
        lastVerifyError: creds.lastVerifyError,
      }
    : { configured: false as const };

  return (
    <div>
      <PageHeader
        icon={Mic}
        category="Integrationen"
        title="Webex"
        subtitle="Konfiguration, Setup-Anleitung, Aufzeichnungen, Transkripte und Click-to-Call."
      />
      <WebexSettings
        connection={connection}
        recordings={{
          fetchedLast24h: fetchedLast24h ?? 0,
          pendingCount: pendingCount ?? 0,
        }}
        transcripts={{
          transcribedLast24h: transcribedLast24h ?? 0,
          pendingTranscripts: pendingTranscripts ?? 0,
          aiNotEnabledCount: aiNotEnabledCount ?? 0,
        }}
      />
    </div>
  );
}
