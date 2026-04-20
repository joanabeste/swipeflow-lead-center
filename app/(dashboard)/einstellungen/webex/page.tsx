import { Mic } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../_components/ui";
import { WebexSettings } from "./_components/webex-settings";
import { getWebexCredentials } from "@/lib/webex/auth";

/**
 * Zählt mit Filter — gibt 0 zurück, wenn die Filter-Spalte fehlt
 * (z.B. vor Migration 025). So rutscht die Seite nicht in die Error-Boundary.
 */
async function safeCount(
  q: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function WebexSettingsPage() {
  const supabase = await createClient();
  // Server Component — einmalig pro Request, Date.now() pragmatisch OK.
  // eslint-disable-next-line react-hooks/purity
  const last24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [
    fetchedLast24h,
    pendingCount,
    transcribedLast24h,
    pendingTranscripts,
    aiNotEnabledCount,
    creds,
  ] = await Promise.all([
    safeCount(
      supabase
        .from("lead_calls")
        .select("*", { count: "exact", head: true })
        .gte("recording_fetched_at", last24h),
    ),
    safeCount(
      supabase
        .from("lead_calls")
        .select("*", { count: "exact", head: true })
        .is("recording_url", null)
        .not("ended_at", "is", null)
        .gte("started_at", last24h),
    ),
    safeCount(
      supabase
        .from("lead_calls")
        .select("*", { count: "exact", head: true })
        .gte("transcript_fetched_at", last24h),
    ),
    safeCount(
      supabase
        .from("lead_calls")
        .select("*", { count: "exact", head: true })
        .is("transcript_id", null)
        .not("recording_url", "is", null)
        .gte("started_at", last24h),
    ),
    safeCount(
      supabase
        .from("lead_calls")
        .select("*", { count: "exact", head: true })
        .ilike("transcript_fetch_error", "%AI Assistant%")
        .gte("started_at", last24h),
    ),
    getWebexCredentials().catch(() => null),
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
        recordings={{ fetchedLast24h, pendingCount }}
        transcripts={{
          transcribedLast24h,
          pendingTranscripts,
          aiNotEnabledCount,
        }}
      />
    </div>
  );
}
