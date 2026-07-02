import { headers } from "next/headers";
import { CalendarClock } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getCalendlyCredentials } from "@/lib/calendly/auth";
import { listEventTypes } from "@/lib/calendly/client";
import { PageHeader } from "../_components/ui";
import { CalendlySettings } from "./_components/calendly-settings";

// Buchungs-Links → Default-Status (Smart-Defaults für die Mapping-Tabelle).
const SETTING_SLUG = "kostenlose-demo-website-inhaltliche-besprechung";
const CLOSING_SLUG = "demo-website-vorstellung";

export default async function CalendlyPage() {
  await requireAdmin();
  const db = createServiceClient();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const webhookUrl = `${proto}://${host}/api/calendly/webhook`;

  const creds = await getCalendlyCredentials().catch(() => null);

  const [{ data: statusRows }, { data: mappingRows }] = await Promise.all([
    db
      .from("custom_lead_statuses")
      .select("id, label, display_order, is_active")
      .order("display_order"),
    db
      .from("calendly_event_mappings")
      .select("event_type_uri, booked_status_id, canceled_status_id, is_active"),
  ]);

  const statuses = (statusRows ?? []).filter((s) => s.is_active !== false) as {
    id: string; label: string; display_order: number; is_active: boolean;
  }[];

  // Event-Typen nur laden, wenn ein Token da ist. Fehler nicht fatal.
  let eventTypes: { uri: string; name: string; scheduling_url: string | null }[] = [];
  let eventTypesError: string | null = null;
  if (creds) {
    try {
      const userUri = creds.userUri;
      if (userUri) {
        const list = await listEventTypes(creds.token, userUri);
        eventTypes = list
          .filter((e) => e.active)
          .map((e) => ({ uri: e.uri, name: e.name, scheduling_url: e.scheduling_url ?? null }));
      } else {
        eventTypesError = "User-URI fehlt — Token neu speichern.";
      }
    } catch (e) {
      eventTypesError = e instanceof Error ? e.message : "Event-Typen konnten nicht geladen werden.";
    }
  }

  const mappingByUri = new Map(
    (mappingRows ?? []).map((m) => [m.event_type_uri as string, m]),
  );

  // Mapping-Zeilen mit Smart-Defaults zusammenstellen.
  const mappings = eventTypes.map((et) => {
    const existing = mappingByUri.get(et.uri);
    const url = (et.scheduling_url ?? "").toLowerCase();
    const suggested = url.includes(SETTING_SLUG)
      ? "termin-gelegt"
      : url.includes(CLOSING_SLUG)
        ? "closing-termin-gelegt"
        : null;
    return {
      eventTypeUri: et.uri,
      eventTypeName: et.name,
      schedulingUrl: et.scheduling_url,
      bookedStatusId: (existing?.booked_status_id as string | null) ?? suggested,
      canceledStatusId: (existing?.canceled_status_id as string | null) ?? null,
      saved: !!existing,
    };
  });

  const connection = creds
    ? {
        configured: true as const,
        source: creds.source,
        hasWebhook: !!creds.webhookUri,
        callbackUrl: creds.callbackUrl,
        lastVerifyError: creds.lastVerifyError,
      }
    : { configured: false as const };

  return (
    <div>
      <PageHeader
        icon={CalendarClock}
        category="Integrationen"
        title="Calendly"
        subtitle="Buchungen setzen automatisch den Lead-Status und werden in der Lead-Historie protokolliert."
      />
      <CalendlySettings
        connection={connection}
        webhookUrl={webhookUrl}
        statuses={statuses}
        mappings={mappings}
        eventTypesError={eventTypesError}
      />
    </div>
  );
}
