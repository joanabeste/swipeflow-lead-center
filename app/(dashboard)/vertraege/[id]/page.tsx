import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Clock } from "lucide-react";
import { loadContract, loadContractEvents } from "@/lib/contracts/data";
import { buildContractLink } from "@/lib/email/central";
import { formatEuro } from "@/lib/contracts/format";
import { CONTRACT_TYPE_LABELS, EVENT_LABELS, isExpired, isContractEditable, isLinkActive, daysUntilExpiry, type ContractStatus } from "@/lib/contracts/types";
import { StatusBadge } from "../_components/status-badge";
import { ContractActions } from "../_components/contract-actions";

function fmtDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("de-DE") : "—";
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("de-DE") : "—";
}

const PAYMENT_MODE_LABEL = { einmal: "Einmalzahlung", raten: "Ratenzahlung" } as const;
const PAYMENT_METHOD_LABEL = { sepa: "SEPA-Lastschrift", rechnung: "Rechnung" } as const;

export default async function VertragDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadContract(id);
  if (!loaded) notFound();
  const { contract, lead } = loaded;
  const events = await loadContractEvents(id);

  const expired = isExpired(contract);
  const link = contract.token ? buildContractLink(contract.token) : null;
  const customerName = contract.billing_company || lead?.company_name || "Unbenannter Kunde";

  // Erstellt-Zeitpunkt ohne Sekunden (ruhigere Meta-Zeile).
  const createdLabel = new Date(contract.created_at).toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  // Ablauf-Dringlichkeit: rot wenn abgelaufen, gelb wenn ≤ 5 Tage Restlaufzeit.
  const daysLeft = daysUntilExpiry(contract);
  const expirySoon = !expired && daysLeft != null && daysLeft >= 1 && daysLeft <= 5;
  const expiryColor = expired
    ? "text-red-600 dark:text-red-400"
    : expirySoon
      ? "text-amber-600 dark:text-amber-400"
      : "text-gray-500 dark:text-gray-400";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/vertraege" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
      </Link>

      <header className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={contract.status as ContractStatus} expired={expired} emailed={!!contract.sent_at} />
            <span className="inline-flex items-center rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:border-white/10 dark:text-gray-400">
              {CONTRACT_TYPE_LABELS[contract.type]}
            </span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{customerName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <CalendarClock className="h-3.5 w-3.5 text-gray-400" /> Erstellt {createdLabel}
            </span>
            {contract.expires_at && (
              <span className={`inline-flex items-center gap-1.5 ${expiryColor}`}>
                <Clock className="h-3.5 w-3.5 opacity-70" />
                {expired ? "Link abgelaufen am" : "Link gültig bis"} {fmtDate(contract.expires_at)}
                {expirySoon && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    noch {daysLeft} {daysLeft === 1 ? "Tag" : "Tage"}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="border-t border-gray-100 px-6 py-4 dark:border-white/5">
          <ContractActions
            id={contract.id}
            status={contract.status as ContractStatus}
            expired={expired}
            link={link}
            linkActive={isLinkActive(contract)}
            editable={isContractEditable(contract)}
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Konditionen */}
        <Card title="Konditionen">
          {contract.type === "recruiting" ? (
            <>
              <Row label="Jobtitel" value={contract.job_title || "—"} />
              <Row label="Laufzeit" value={`${fmtDate(contract.campaign_start)} – ${fmtDate(contract.campaign_end)}`} />
              <Row label="Agenturleistung" value={`${formatEuro(contract.setup_price_cents)} netto`} />
              <Row label="Werbebudget" value={`${formatEuro(contract.ad_budget_cents)} netto`} />
              <Row label="Bewerbergarantie" value={contract.applicant_guarantee ? "Ja" : "Nein"} />
              <Row label="Zahlungsmethode" value={PAYMENT_METHOD_LABEL[contract.payment_method]} />
            </>
          ) : contract.type === "content" ? (
            <>
              <Row label="Monatlicher Betrag" value={`${formatEuro(contract.monthly_maint_cents)} netto / Monat`} />
              {contract.setup_price_cents > 0 && (
                <Row label="Einrichtungsgebühr" value={`${formatEuro(contract.setup_price_cents)} netto`} />
              )}
              <Row label="Plattformen" value={contract.content_platforms || "Instagram und Facebook"} />
              <Row label="Frequenz" value={contract.posts_per_week ? `${contract.posts_per_week} Beiträge/Monat` : "nach Absprache"} />
              <Row label="Vor-Ort-Produktion" value={contract.onsite_production ? (contract.onsite_interval_months ? `alle ${contract.onsite_interval_months} Monate` : "nach Bedarf") : "Nein"} />
              <Row label="Vertragsbeginn" value={fmtDate(contract.campaign_start)} />
              <Row label="Mindestlaufzeit" value={contract.min_term_months > 0 ? `${contract.min_term_months} Monate` : "keine"} />
              <Row label="Kündigungsfrist" value={`${contract.notice_period_weeks} Wochen`} />
              <Row label="Zahlungsmethode" value={PAYMENT_METHOD_LABEL[contract.payment_method]} />
            </>
          ) : (
            <>
              <Row label="Herstellungspreis" value={`${formatEuro(contract.setup_price_cents)} netto`} />
              <Row label="Wartung/Hosting" value={`${formatEuro(contract.monthly_maint_cents)} netto / Monat (jährlich)`} />
              <Row label="Zahlungsart" value={PAYMENT_MODE_LABEL[contract.payment_mode]} />
              {contract.payment_mode === "raten" && (
                <Row label="Raten" value={`${contract.installment_count ?? "—"}`} />
              )}
              <Row label="Zahlungsmethode" value={PAYMENT_METHOD_LABEL[contract.payment_method]} />
            </>
          )}
        </Card>

        {/* Kunden- & Zahlungsdaten (vom Kunden ausgefüllt) */}
        <Card title="Kunden- & Zahlungsdaten">
          <Row label="Firma" value={contract.billing_company || lead?.company_name || "—"} />
          <Row label="Anschrift" value={[contract.billing_street, [contract.billing_zip, contract.billing_city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"} />
          <Row label="E-Mail" value={contract.billing_email || lead?.email || "—"} />
          {contract.payment_method === "sepa" && (
            <>
              <Row label="Kontoinhaber" value={contract.sepa_account_holder || "—"} />
              <Row label="IBAN" value={contract.sepa_iban_last4 ? `•••• •••• •••• ${contract.sepa_iban_last4}` : "—"} />
            </>
          )}
          {contract.status === "signed" && (
            <Row label="Unterschrieben am" value={fmtDateTime(contract.signed_at)} />
          )}
        </Card>
      </div>

      {/* Historie */}
      <Card title="Historie">
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine Ereignisse.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    {e.event === "sent" && e.meta?.channel === "link" ? "Link erstellt" : (EVENT_LABELS[e.event] ?? e.event)}
                  </p>
                  {typeof e.meta?.email_error === "string" && (
                    <p className="text-[11px] text-red-500">E-Mail-Fehler: {e.meta.email_error}</p>
                  )}
                  {typeof e.meta?.to === "string" && !e.meta?.email_error && (
                    <p className="text-[11px] text-gray-400">an {e.meta.to}</p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-gray-400">{fmtDateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}
