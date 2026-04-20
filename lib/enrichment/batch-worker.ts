import { createServiceClient } from "@/lib/supabase/server";
import { enrichLead } from "@/lib/enrichment/enrich-lead";
import { evaluateCancelRules, formatCancelReason, formatError } from "@/lib/cancel-rules/evaluator";
import type { EnrichmentConfig, CancelRule, ServiceMode } from "@/lib/types";

const CONCURRENCY = 3;

export interface EnrichJobResult {
  leadId: string;
  name: string;
  success: boolean;
  contactsCount?: number;
  jobsCount?: number;
  firstContactName?: string | null;
  hasEmail?: boolean;
  hasPhone?: boolean;
  websiteIssues?: number;
  hasSsl?: boolean;
  isMobile?: boolean;
  websiteTech?: string;
  designEstimate?: string;
  cancelled?: boolean;
  cancelReason?: string;
  error?: string;
}

/**
 * Arbeitet einen `enrichment_jobs`-Row ab.
 *
 * Wird aus der Start-Route via `after()` aufgerufen, d.h. die HTTP-Response
 * ist zu diesem Zeitpunkt schon zurück beim Client. Der Browser kann
 * schließen — die Function läuft bis `maxDuration` (300 s) weiter.
 *
 * Fortschritt + Teilergebnisse werden nach jedem Lead in der DB aktualisiert,
 * damit Polling-Clients sie lesen können.
 */
export async function processEnrichmentJob(jobId: string): Promise<void> {
  const db = createServiceClient();

  // Job + leadIds laden
  const { data: job, error: loadErr } = await db
    .from("enrichment_jobs")
    .select("user_id, lead_ids, config, service_mode, status")
    .eq("id", jobId)
    .single();

  if (loadErr || !job) {
    return;
  }
  if (job.status !== "pending") {
    // Schon gestartet (doppel-triggered oder restart) — nichts tun.
    return;
  }

  const userId = job.user_id as string;
  const leadIds = (job.lead_ids as string[]) ?? [];
  const config = (job.config as unknown as EnrichmentConfig) ?? null;
  const serviceMode = (job.service_mode as ServiceMode) ?? "recruiting";

  if (!config || leadIds.length === 0) {
    await db
      .from("enrichment_jobs")
      .update({
        status: "failed",
        last_error: "Ungültiger Job-Input",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return;
  }

  // Status auf running setzen
  await db
    .from("enrichment_jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  // Leads + Cancel-Rules vorladen
  const [{ data: leads }, { data: cancelRules }] = await Promise.all([
    db
      .from("leads")
      .select(
        "id, company_name, status, blacklist_hit, cancel_reason, legal_form, company_size, domain, website",
      )
      .in("id", leadIds),
    db.from("cancel_rules").select("*").eq("is_active", true),
  ]);
  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));

  // Serialisierte DB-Writes pro Job-Row, damit paralleler Worker-Pool
  // nicht `results`-Appends verliert (JSONB-Merge ist nicht idempotent
  // bei paralleler Last, wenn beide den gleichen Vorher-Zustand sehen).
  let writeLock: Promise<unknown> = Promise.resolve();
  function queueWrite<T>(fn: () => PromiseLike<T>): Promise<T> {
    const next = writeLock.then(fn, fn);
    writeLock = next.catch(() => {});
    return next as Promise<T>;
  }

  async function appendResult(result: EnrichJobResult, currentLeadName: string | null) {
    await queueWrite(async () => {
      // JSONB-Append via RPC oder Fallback: read-modify-write.
      // Supabase-JS hat keinen nativen JSONB-Append-Syntax — der simple
      // Ansatz: bestehenden Array laden, neues Element pushen, schreiben.
      const { data: row } = await db
        .from("enrichment_jobs")
        .select("results, processed")
        .eq("id", jobId)
        .single();
      const existing = (row?.results as EnrichJobResult[]) ?? [];
      const processed = (row?.processed as number | null) ?? 0;
      await db
        .from("enrichment_jobs")
        .update({
          results: [...existing, result],
          processed: processed + 1,
          current_lead_name: currentLeadName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    });
  }

  async function setCurrentLead(name: string) {
    await queueWrite(() =>
      db
        .from("enrichment_jobs")
        .update({ current_lead_name: name, updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .then(() => undefined),
    );
  }

  async function processLead(leadId: string): Promise<void> {
    const lead = leadMap.get(leadId);
    const name = (lead?.company_name as string | undefined) ?? "Unbekannt";
    await setCurrentLead(name);

    // 1. Blacklist / Pre-Cancel
    if (lead?.blacklist_hit || lead?.status === "filtered") {
      const reason = (lead.cancel_reason as string | null) || "Bereits ausgeschlossen";
      await appendResult(
        {
          leadId,
          name,
          success: true,
          cancelled: true,
          cancelReason: formatCancelReason(reason),
          contactsCount: 0,
          jobsCount: 0,
          hasEmail: false,
          hasPhone: false,
        },
        name,
      );
      return;
    }

    // 2. Cancel-Rules Pre-Check (nur recruiting)
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
        await db
          .from("leads")
          .update({
            status: "cancelled",
            cancel_reason: reason,
            cancel_rule_id: preCheck.reasons[0].ruleId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
        await appendResult(
          {
            leadId,
            name,
            success: true,
            cancelled: true,
            cancelReason: formatCancelReason(reason),
            contactsCount: 0,
            jobsCount: 0,
            hasEmail: false,
            hasPhone: false,
          },
          name,
        );
        return;
      }
    }

    // 3. Enrichment
    try {
      const result = await enrichLead(leadId, userId, config, serviceMode);
      await appendResult(
        {
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
        },
        name,
      );
    } catch (e) {
      await appendResult(
        {
          leadId,
          name,
          success: false,
          error: formatError(e instanceof Error ? e.message : "Unbekannter Fehler"),
        },
        name,
      );
    }
  }

  // Worker-Pool
  try {
    const queue = [...leadIds];
    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await processLead(next);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, leadIds.length) }, () => worker()),
    );

    await queueWrite(() =>
      db
        .from("enrichment_jobs")
        .update({
          status: "completed",
          current_lead_name: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .then(() => undefined),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unbekannter Fehler";
    await db
      .from("enrichment_jobs")
      .update({
        status: "failed",
        last_error: message,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}
