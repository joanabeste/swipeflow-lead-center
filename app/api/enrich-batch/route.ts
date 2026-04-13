import { createClient, createServiceClient } from "@/lib/supabase/server";
import { enrichLead } from "@/lib/enrichment/enrich-lead";
import type { EnrichmentConfig } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  // Auth-Check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json();
  const leadIds: string[] = body.leadIds ?? [];
  const config: EnrichmentConfig = body.config ?? DEFAULT_ENRICHMENT_CONFIG;

  if (leadIds.length === 0) {
    return new Response("No lead IDs", { status: 400 });
  }

  // Lead-Namen laden
  const db = createServiceClient();
  const { data: leads } = await db
    .from("leads")
    .select("id, company_name")
    .in("id", leadIds);

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l.company_name]));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      for (const leadId of leadIds) {
        const name = leadMap.get(leadId) ?? "Unbekannt";

        send({ type: "start", leadId, name });

        try {
          const result = await enrichLead(leadId, user.id, config);

          send({
            type: "complete",
            leadId,
            name,
            success: result.success,
            contactsCount: result.contactsCount ?? 0,
            jobsCount: result.jobsCount ?? 0,
            firstContactName: result.firstContactName ?? null,
            hasEmail: result.hasEmail ?? false,
            hasPhone: result.hasPhone ?? false,
            cancelled: result.cancelled ?? false,
            cancelReason: result.cancelReason,
            error: result.error,
          });
        } catch (e) {
          send({
            type: "complete",
            leadId,
            name,
            success: false,
            error: e instanceof Error ? e.message : "Unbekannter Fehler",
          });
        }

        // Pause zwischen Leads (Rate-Limiting / Overload-Schutz)
        await new Promise((r) => setTimeout(r, 3000));
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
