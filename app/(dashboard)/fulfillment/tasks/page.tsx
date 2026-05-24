import Link from "next/link";
import { ExternalLink, CheckSquare } from "lucide-react";
import { loadAllOpenTasks } from "@/lib/fulfillment/data";
import { formatDateDe } from "@/lib/zeit/format";

export default async function TasksPage() {
  const tasks = await loadAllOpenTasks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">ClickUp-Tasks</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tasks.length} offene Tasks projektuebergreifend</p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-[#2c2c2e]/60">
          <CheckSquare className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">Keine offenen Tasks.</p>
          <p className="mt-1 text-xs text-gray-500">Verknuepfe ein Projekt mit einer ClickUp-Liste und ziehe die Tasks via „Sync".</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#1c1c1e]">
              <tr>
                <th className="px-4 py-3 text-left">Task</th>
                <th className="px-4 py-3 text-left">Kunde / Projekt</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Faellig</th>
                <th className="px-4 py-3 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {tasks.map((t) => (
                <tr key={t.clickup_task_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{t.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {t.customer_name && <span>{t.customer_name}</span>}
                    {t.customer_name && t.project_name && " · "}
                    {t.project_name && (
                      <Link href={`/fulfillment/projekte/${t.project_id}`} className="text-primary hover:underline">{t.project_name}</Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.status && (
                      <span style={{ color: t.status_color ?? undefined }} className="text-xs font-semibold uppercase tracking-wider">{t.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.due_date ? formatDateDe(t.due_date) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {t.url && (
                      <a href={t.url} target="_blank" rel="noreferrer" className="inline-block rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
