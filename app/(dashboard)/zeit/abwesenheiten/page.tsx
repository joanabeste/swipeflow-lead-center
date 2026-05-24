import { requireZeitUser } from "@/lib/zeit/auth";
import { loadAllProfiles, loadOwnAbsences } from "../_components/data-helpers";
import { AbsenceForm } from "./_components/absence-form";
import { DeleteAbsenceButton } from "./_components/absence-actions";
import { vacationDaysFromProfile } from "@/lib/zeit/types";
import { countWorkdaysInAbsences } from "@/lib/zeit/reports";
import { formatDateDe } from "@/lib/zeit/format";

const TYPE_LABELS: Record<string, string> = { vacation: "Urlaub", sick: "Krank", other: "Sonstiges" };
const STATUS_LABELS: Record<string, string> = { pending: "Ausstehend", approved: "Genehmigt", rejected: "Abgelehnt" };

export default async function ZeitAbwesenheitenPage() {
  const ctx = await requireZeitUser();
  const [absences, profiles] = await Promise.all([
    loadOwnAbsences(ctx.user.id),
    loadAllProfiles(),
  ]);
  const nameById = new Map(profiles.map((p) => [p.id, p.name || p.email]));
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const total = vacationDaysFromProfile(ctx.profile);
  const approved = countWorkdaysInAbsences(absences, yearStart, yearEnd, "vacation");
  const pending = absences
    .filter((a) => a.status === "pending" && a.type === "vacation")
    .reduce((acc, a) => {
      const f = new Date(a.date_from + "T00:00:00");
      const t = new Date(a.date_to + "T00:00:00");
      let days = 0;
      for (const d = new Date(f); d <= t; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) days += 1;
      }
      return acc + days;
    }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Abwesenheiten</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Urlaub, Krankheit und Sonstige</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <BalanceCard label="Anspruch" value={`${total} Tage`} />
        <BalanceCard label="Genehmigt" value={`${approved}`} />
        <BalanceCard label="Ausstehend" value={`${pending}`} />
        <BalanceCard label="Verbleibend" value={`${Math.max(0, total - approved - pending)}`} />
      </div>

      <AbsenceForm />

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        {absences.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">Noch keine Antraege.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
              <tr>
                <th className="px-4 py-3 text-left">Art</th>
                <th className="px-4 py-3 text-left">Von</th>
                <th className="px-4 py-3 text-left">Bis</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Notiz</th>
                <th className="px-4 py-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {absences.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{TYPE_LABELS[a.type] ?? a.type}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDateDe(a.date_from)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDateDe(a.date_to)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                    {a.decided_by && a.decided_at && (
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        von {nameById.get(a.decided_by) ?? "—"} · {formatDateDe(a.decided_at)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{a.note ?? ""}</td>
                  <td className="px-4 py-3 text-right">
                    {a.status === "pending" && <DeleteAbsenceButton id={a.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BalanceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved" ? "bg-green-100 text-green-700" :
    status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
