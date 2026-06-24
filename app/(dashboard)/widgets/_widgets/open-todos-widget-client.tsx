"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { CalendarClock, Users, User } from "lucide-react";
import type { DashboardData } from "../data";
import { Card } from "./shared";

type TodoItem = DashboardData["openTodoItems"][number];
type Person = DashboardData["todoPeople"][number];

/** Gleicher Key wie die ToDos-Seite — „meine ToDos" gilt konsistent überall. */
const PERSON_FILTER_KEY = "todos.personFilter";

function formatTodoDue(dueDate: string, todayKey: string): string {
  if (dueDate < todayKey) {
    const days = Math.floor((Date.parse(todayKey) - Date.parse(dueDate)) / 86400_000);
    return days === 1 ? "Gestern" : `${days} Tg.`;
  }
  if (dueDate === todayKey) return "Heute";
  const diff = Math.floor((Date.parse(dueDate) - Date.parse(todayKey)) / 86400_000);
  if (diff === 1) return "Morgen";
  if (diff <= 7) return `In ${diff} Tg.`;
  const [y, m, d] = dueDate.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

export function OpenTodosWidgetClient({
  items,
  people,
  currentUserId,
}: {
  items: TodoItem[];
  people: Person[];
  currentUserId: string;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);

  // Default „Meine" — Auswahl pro Browser merken, geteilt mit der ToDos-Seite.
  const [personFilter, setPersonFilter] = useState<string>(currentUserId);
  useEffect(() => {
    const saved = localStorage.getItem(PERSON_FILTER_KEY);
    if (!saved) return;
    if (saved === "all" || saved === currentUserId || people.some((p) => p.id === saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPersonFilter(saved);
    }
  }, [people, currentUserId]);

  function selectPerson(value: string) {
    setPersonFilter(value);
    localStorage.setItem(PERSON_FILTER_KEY, value);
  }

  const scoped = useMemo(() => {
    if (personFilter === "all") return items;
    return items.filter((t) => t.createdBy === personFilter);
  }, [items, personFilter]);

  const overdue = scoped.filter((t) => t.tone === "overdue");
  const dueToday = scoped.filter((t) => t.tone === "today");
  const upcoming = scoped.filter((t) => t.tone === "soon");
  const urgent = overdue.length + dueToday.length;
  const showOwner = personFilter === "all";

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-3.5 dark:border-[#2c2c2e]/50">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarClock className="h-3.5 w-3.5 text-primary" />
          Anstehende ToDos
          {urgent > 0 && (
            <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {urgent}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {people.length > 1 && (
            <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400" title="ToDos welcher Person?">
              <Users className="h-3.5 w-3.5 text-gray-400" />
              <select
                value={personFilter}
                onChange={(e) => selectPerson(e.target.value)}
                className="max-w-[120px] bg-transparent text-xs font-medium text-gray-700 outline-none dark:text-gray-200"
                aria-label="ToDos welcher Person anzeigen"
              >
                <option value={currentUserId}>Meine</option>
                {people
                  .filter((p) => p.id !== currentUserId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                <option value="all">Alle</option>
              </select>
            </label>
          )}
          <Link href="/todos" className="text-xs text-primary hover:underline">Alle</Link>
        </div>
      </div>
      {scoped.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">
          Keine anstehenden ToDos — alles aktuell.
        </p>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-[#2c2c2e]/50">
          {[
            { label: "Überfällig", items: overdue, badge: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
            { label: "Heute fällig", items: dueToday, badge: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
            { label: "Diese Woche", items: upcoming, badge: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
          ].filter((s) => s.items.length > 0).map((section) => (
            <div key={section.label}>
              <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {section.label}
              </p>
              {section.items.slice(0, 6).map((t) => (
                <Link
                  key={t.id}
                  href={`/crm/${t.leadId}`}
                  className="flex items-center justify-between gap-2 px-5 py-2 transition hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      <span className="truncate">
                        {t.company_name}
                        {t.city && <span className="ml-1.5 text-gray-400">· {t.city}</span>}
                      </span>
                      {showOwner && t.ownerName && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-gray-400">
                          <User className="h-2.5 w-2.5" />
                          {t.ownerName}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${section.badge}`}>
                    {t.dueTime ? `${formatTodoDue(t.dueDate, todayKey)} · ${t.dueTime}` : formatTodoDue(t.dueDate, todayKey)}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
