import { loadAllAbsences, loadAllProfiles } from "../../_components/data-helpers";
import { DecisionButtons } from "./_components/decision-buttons";
import { formatDateDe } from "@/lib/zeit/format";

const TYPE_LABELS: Record<string, string> = { vacation: "Urlaub", sick: "Krank", other: "Sonstiges" };
const STATUS_LABELS: Record<string, string> = { pending: "Ausstehend", approved: "Genehmigt", rejected: "Abgelehnt" };

export default async function AdminAbwesenheitenPage() {
  const [absences, profiles] = await Promise.all([loadAllAbsences(), loadAllProfiles()]);
  const nameById = new Map(profiles.map((p) => [p.id, p.name || p.email]));

  const pending = absences.filter((a) => a.status === "pending");
  const decided = absences.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Abwesenheits-Antraege</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ausstehende und entschiedene Antraege aller Mitarbeiter</p>
      </div>

      <Section title={`Ausstehend (${pending.length})`}>
        {pending.length === 0 ? <Empty>Keine offenen Antraege.</Empty> : (
          <Table>
            <thead><TableHeaderRow /></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {pending.map((a) => (
                <tr key={a.id}>
                  <Td>{nameById.get(a.user_id) ?? a.user_id}</Td>
                  <Td>{TYPE_LABELS[a.type] ?? a.type}</Td>
                  <Td>{formatDateDe(a.date_from)} – {formatDateDe(a.date_to)}</Td>
                  <Td>{a.note ?? ""}</Td>
                  <Td><DecisionButtons id={a.id} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Entschieden">
        {decided.length === 0 ? <Empty>Noch nichts entschieden.</Empty> : (
          <Table>
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
                <Th>Mitarbeiter</Th><Th>Art</Th><Th>Zeitraum</Th><Th>Notiz</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {decided.map((a) => (
                <tr key={a.id}>
                  <Td>{nameById.get(a.user_id) ?? a.user_id}</Td>
                  <Td>{TYPE_LABELS[a.type] ?? a.type}</Td>
                  <Td>{formatDateDe(a.date_from)} – {formatDateDe(a.date_to)}</Td>
                  <Td>{a.note ?? ""}</Td>
                  <Td>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</h2>
      {children}
    </section>
  );
}
function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
function TableHeaderRow() {
  return (
    <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
      <Th>Mitarbeiter</Th><Th>Art</Th><Th>Zeitraum</Th><Th>Notiz</Th><Th>Aktion</Th>
    </tr>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{children}</td>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">{children}</p>;
}
