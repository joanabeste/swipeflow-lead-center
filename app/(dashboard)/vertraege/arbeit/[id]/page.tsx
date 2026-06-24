import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatEuro } from "@/lib/contracts/format";
import { isExpired, isLinkActive, isContractDeletable } from "@/lib/contracts/types";
import { buildEmploymentLink } from "@/lib/email/central";
import {
  loadEmploymentContract,
  loadEmploymentEvents,
  loadQuestionnaire,
  buildEmploymentRenderInput,
} from "@/lib/employment/data";
import { renderEmploymentContractHtml } from "@/lib/employment/template";
import { employeeName, VARIANT_LABELS, type EmploymentEventType } from "@/lib/employment/types";
import { StatusBadge } from "../../_components/status-badge";
import { EmploymentActions } from "../_components/employment-actions";

const EVENT_LABELS: Record<EmploymentEventType, string> = {
  created: "Erstellt",
  sent: "Link/Versand",
  viewed: "Vom Mitarbeiter geöffnet",
  signed: "Unterschrieben",
  downloaded: "PDF heruntergeladen",
  resent: "Erneut gesendet",
  extended: "Gültigkeit verlängert",
  cancelled: "Storniert",
  questionnaire_submitted: "Personalfragebogen ausgefüllt",
};

function dt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("de-DE") : "—";
}

export default async function ArbeitsvertragDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await loadEmploymentContract(id);
  if (!contract) notFound();

  const [events, questionnaire] = await Promise.all([
    loadEmploymentEvents(id),
    contract.status === "signed" ? loadQuestionnaire(id) : Promise.resolve(null),
  ]);

  const previewHtml = renderEmploymentContractHtml(buildEmploymentRenderInput(contract, { mode: "view" }));
  const link = contract.token ? buildEmploymentLink(contract.token) : null;
  const verguetung =
    contract.pay_model === "hourly"
      ? `${formatEuro(contract.hourly_wage_cents)} / Stunde`
      : `${formatEuro(contract.monthly_salary_cents)} / Monat`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/vertraege/arbeit" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Zurück zu Arbeitsverträgen
        </Link>
        <div className="mt-3 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {employeeName(contract) || "Unbenannt"}
          </h1>
          <StatusBadge status={contract.status} expired={isExpired(contract)} emailed={!isLinkActive(contract)} />
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {VARIANT_LABELS[contract.variant]} · {verguetung}
          {contract.commission_per_appointment_cents > 0 && ` · ${formatEuro(contract.commission_per_appointment_cents)} Provision/Termin`}
        </p>
      </div>

      <EmploymentActions
        id={contract.id}
        status={contract.status}
        deletable={isContractDeletable(contract)}
        hasEmail={!!contract.employee_email}
        initialLink={link}
        questionnaireSubmitted={questionnaire?.status === "submitted"}
      />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Eckdaten</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label="Eintritt" value={contract.start_date ? new Date(contract.start_date).toLocaleDateString("de-DE") : "—"} />
          <Row label="Probezeit" value={`${contract.probation_months} Monate`} />
          <Row label="Wochenstunden" value={`${contract.weekly_hours} Std. / ${contract.workdays_per_week} Tage`} />
          <Row label="Urlaub" value={`${contract.vacation_days} Tage`} />
          <Row label="Befristung" value={contract.fixed_term ? `bis ${contract.end_date ? new Date(contract.end_date).toLocaleDateString("de-DE") : "—"}` : "Unbefristet"} />
          <Row label="Reisekosten" value={contract.travel_cost_reimbursed ? "Werden erstattet" : "Trägt Mitarbeiter"} />
        </dl>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Vertragsvorschau</h2>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2c2c2e]/50">
          <iframe title="Arbeitsvertrag-Vorschau" srcDoc={previewHtml} className="h-[70vh] w-full" />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Verlauf</h2>
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3">
              <span className="text-gray-700 dark:text-gray-300">{EVENT_LABELS[e.event] ?? e.event}</span>
              <span className="text-xs text-gray-400">{dt(e.created_at)}</span>
            </li>
          ))}
          {events.length === 0 && <li className="text-xs text-gray-400">Noch keine Ereignisse.</li>}
        </ul>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-right font-medium text-gray-900 dark:text-white">{value}</dd>
    </>
  );
}
