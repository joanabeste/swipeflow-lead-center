import { createClient, createServiceClient } from "@/lib/supabase/server";
import { enrichLead } from "@/lib/enrichment/enrich-lead";
import { evaluateCancelRules, formatCancelReason, formatError } from "@/lib/cancel-rules/evaluator";
import type { EnrichmentConfig, CancelRule, ServiceMode } from "@/lib/types";
import { DEFAULT_ENRICHMENT_CONFIG } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  // Auth-Check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = user.id;

  const body = await request.json();
  const leadIds: string[] = body.leadIds ?? [];
  const config: EnrichmentConfig = body.config ?? DEFAULT_ENRICHMENT_CONFIG;
  const serviceMode: ServiceMode = body.serviceMode ?? "recruiting";

  if (leadIds.length === 0) {
    return new Response("No lead IDs", { status: 400 });
  }

  const db = createServiceClient();

  // Leads + Cancel-Rules vorladen
  const [{ data: leads }, { data: cancelRules }] = await Promise.all([
    db.from("leads").select("id, company_name, status, blacklist_hit, cancel_reason, legal_form, company_size, domain, website").in("id", leadIds),
    db.from("cancel_rules").select("*").eq("is_active", true),
  ]);

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));

  const encoder = new TextEncoder();

  // Bis zu 3 Leads parallel anreichern. Node ist single-threaded, daher sind
  // controller.enqueue-Aufrufe atomar — SSE-Events können aus der Reihenfolge
  // kommen, die UI matched per leadId.
  const CONCURRENCY = 3;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      async function processLead(leadId: string) {
        const lead = leadMap.get(leadId);
        const name = lead?.company_name ?? "Unbekannt";

        send({ type: "start", leadId, name });

        // === Pre-Check: Kann der Lead übersprungen werden? ===

        // 1. Hart gefiltert (Blacklist) oder explizit gefiltert — keine Re-Evaluation
        if (lead?.blacklist_hit || lead?.status === "filtered") {
          const reason = lead.cancel_reason || "Bereits ausgeschlossen";
          send({
            type: "complete", leadId, name,
            success: true, cancelled: true,
            cancelReason: formatCancelReason(reason),
            contactsCount: 0, jobsCount: 0, hasEmail: false, hasPhone: false,
          });
          return;
        }
        // Hinweis: status='cancelled' wird BEWUSST nicht short-circuit'd —
        // Re-Enrich soll die Cancel-Rule neu auswerten (z.B. weil seitdem
        // BA-Stellen importiert wurden oder die Karriereseite Jobs hat).
        // Hinweis: Wenn Website/Domain fehlt, sucht enrichLead sie automatisch
        // via findCompanyWebsite. Pre-Skip hier wäre zu früh.

        // 2. Cancel-Rules Pre-Check (Import-Phase Regeln — ohne Enrichment nötig)
        // Im Webdev-Modus: Nur Rechtsform/Größe prüfen, keine Stellen-bezogenen Regeln
        if (cancelRules && cancelRules.length > 0 && serviceMode === "recruiting") {
          const [{ count: totalJobs }, { count: totalContacts }] = await Promise.all([
            db.from("lead_job_postings").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
            db.from("lead_contacts").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
          ]);
          const leadForCheck = {
            ...(lead as Record<string, unknown>),
            job_postings_count: totalJobs ?? 0,
            contacts_count: totalContacts ?? 0,
          };

          const preCheck = evaluateCancelRules(
            leadForCheck,
            cancelRules as CancelRule[],
            "import",
          );
          if (preCheck.cancelled) {
            const reason = preCheck.reasons.map((r) => r.reason).join("; ");
            await db.from("leads").update({
              status: "cancelled",
              cancel_reason: reason,
              cancel_rule_id: preCheck.reasons[0].ruleId,
              updated_at: new Date().toISOString(),
            }).eq("id", leadId);

            send({
              type: "complete", leadId, name,
              success: true, cancelled: true,
              cancelReason: formatCancelReason(reason),
              contactsCount: 0, jobsCount: 0, hasEmail: false, hasPhone: false,
            });
            return;
          }
        }

        // === Enrichment durchführen ===
        try {
          const result = await enrichLead(leadId, userId, config, serviceMode);

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
            websiteIssues: result.websiteIssues ?? 0,
            hasSsl: result.hasSsl,
            isMobile: result.isMobile,
            websiteTech: result.websiteTech,
            designEstimate: result.designEstimate,
            cancelled: result.cancelled ?? false,
            cancelReason: result.cancelReason ? formatCancelReason(result.cancelReason) : undefined,
            error: result.error ? formatError(result.error) : undefined,
          });
        } catch (e) {
          send({
            type: "complete",
            leadId,
            name,
            success: false,
            error: formatError(e instanceof Error ? e.message : "Unbekannter Fehler"),
          });
        }
      }

      // Worker-Pool: feste Anzahl paralleler Consumer pullen aus der Queue.
      const queue = [...leadIds];
      async function worker() {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) return;
          await processLead(next);
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, leadIds.length) }, () => worker()),
      );

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
