"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Filter, ChevronDown, ChevronRight, ListTodo, Loader2 } from "lucide-react";
import { TodoQuickAdd } from "./_components/quick-add";
import { TodoRow } from "./_components/todo-row";
import { bucketOf, byDueDateTime, todayKey } from "./_lib/date-utils";
import type { DueBucket } from "./_lib/date-utils";
import type { TodoWithLead } from "./page";
import {
  bulkRescheduleTodos,
  bulkCompleteTodos,
  bulkDeleteTodos,
} from "./actions";
import { useToastContext } from "../toast-provider";

interface LeadCatalogEntry {
  id: string;
  company_name: string;
  city: string | null;
}

interface Props {
  initialTodos: TodoWithLead[];
  leadCatalog: LeadCatalogEntry[];
}

const BUCKETS_OPEN: { key: DueBucket; label: string; defaultOpen: boolean; tone: string }[] = [
  { key: "overdue", label: "Überfällig", defaultOpen: true, tone: "text-red-600 dark:text-red-400" },
  { key: "today", label: "Heute", defaultOpen: true, tone: "text-amber-600 dark:text-amber-400" },
  { key: "tomorrow", label: "Morgen", defaultOpen: true, tone: "text-blue-600 dark:text-blue-400" },
  { key: "this_week", label: "Diese Woche", defaultOpen: false, tone: "text-gray-600 dark:text-gray-400" },
  { key: "later", label: "Später", defaultOpen: false, tone: "text-gray-500 dark:text-gray-500" },
];

const BUCKET_DONE: { key: DueBucket; label: string; tone: string } = {
  key: "done_today",
  label: "Erledigt heute",
  tone: "text-emerald-600 dark:text-emerald-400",
};

type StatusFilter = "open" | "done" | "all";
/** Schnellfilter über die KPI-Karten. "week" = Morgen + Diese Woche. */
type BucketFilter = "overdue" | "today" | "week" | null;

export function TodosManager({ initialTodos, leadCatalog }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const today = todayKey();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [leadFilter, setLeadFilter] = useState<string>(""); // Lead-ID
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openBuckets, setOpenBuckets] = useState<Set<DueBucket>>(
    () => new Set(BUCKETS_OPEN.filter((b) => b.defaultOpen).map((b) => b.key)),
  );
  const [pending, startTransition] = useTransition();

  // Esc räumt die Selektion auf
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(new Set());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Filter-Pipeline
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return initialTodos.filter((t) => {
      // Status-Filter
      if (status === "open" && t.done_at) return false;
      if (status === "done" && !t.done_at) return false;
      // Lead-Filter
      if (leadFilter && t.lead_id !== leadFilter) return false;
      // KPI-Schnellfilter (nur offene Buckets)
      if (bucketFilter) {
        const b = bucketOf(t.due_date, t.done_at, today);
        if (bucketFilter === "week" ? b !== "tomorrow" && b !== "this_week" : b !== bucketFilter) return false;
      }
      // Suche
      if (q) {
        const hay = `${t.title} ${t.lead?.company_name ?? ""} ${t.lead?.city ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [initialTodos, search, status, leadFilter, bucketFilter, today]);

  // Buckets gruppieren — offene Buckets nach Tag, dann Uhrzeit sortieren.
  const grouped = useMemo(() => {
    const map = new Map<DueBucket, TodoWithLead[]>();
    for (const t of filtered) {
      const b = bucketOf(t.due_date, t.done_at, today);
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(t);
    }
    for (const [key, arr] of map) {
      if (key !== "done_today" && key !== "done_earlier") arr.sort(byDueDateTime);
    }
    return map;
  }, [filtered, today]);

  // Stats für KPI-Strip — basieren auf der ungefilterten Liste, weil das die
  // Echtzahlen sind. Filter sind lediglich Sicht-Anpassung.
  const stats = useMemo(() => {
    let overdue = 0, todayCount = 0, thisWeek = 0, totalOpen = 0;
    for (const t of initialTodos) {
      if (t.done_at) continue;
      totalOpen++;
      const b = bucketOf(t.due_date, null, today);
      if (b === "overdue") overdue++;
      else if (b === "today") todayCount++;
      else if (b === "tomorrow" || b === "this_week") thisWeek++;
    }
    return { overdue, today: todayCount, thisWeek, totalOpen };
  }, [initialTodos, today]);

  // Lead-Filter-Auswahl: Liste der Leads, die in den geladenen Todos vorkommen
  const leadOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of initialTodos) {
      if (t.lead && !seen.has(t.lead.id)) seen.set(t.lead.id, t.lead.company_name);
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [initialTodos]);

  // KPI-Karte als Schnellfilter: toggelt den Bucket-Filter (immer auf „offen")
  // und klappt die betroffenen Bucket-Sektionen auf, damit Treffer sichtbar sind.
  function selectBucket(b: Exclude<BucketFilter, null>) {
    setStatus("open");
    setBucketFilter((prev) => (prev === b ? null : b));
    setOpenBuckets((cur) => {
      const s = new Set(cur);
      if (b === "overdue") s.add("overdue");
      else if (b === "today") s.add("today");
      else if (b === "week") {
        s.add("tomorrow");
        s.add("this_week");
      }
      return s;
    });
  }

  function resetFilters() {
    setSearch("");
    setStatus("open");
    setLeadFilter("");
    setBucketFilter(null);
  }

  function toggleBucket(key: DueBucket) {
    setOpenBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelect(id: string, sel: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (sel) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function runBulk(fn: () => Promise<{ error?: string; success?: boolean }>, msg: string) {
    if (selected.size === 0) return;
    startTransition(async () => {
      const res = await fn();
      if (res.error) addToast(res.error, "error");
      else {
        addToast(msg, "success");
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  const selectedIds = Array.from(selected);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <ListTodo className="h-5 w-5 text-primary" />
          ToDos
        </h1>
        {stats.totalOpen > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {stats.totalOpen} offen
          </span>
        )}
      </div>

      {/* Quick-Add */}
      <TodoQuickAdd leadCatalog={leadCatalog} />

      {/* KPI-Strip — Karten sind klickbare Schnellfilter */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCard
          label="Überfällig"
          value={stats.overdue}
          tone="red"
          active={bucketFilter === "overdue"}
          onClick={() => selectBucket("overdue")}
        />
        <KpiCard
          label="Heute"
          value={stats.today}
          tone="amber"
          active={bucketFilter === "today"}
          onClick={() => selectBucket("today")}
        />
        <KpiCard
          label="Diese Woche"
          value={stats.thisWeek}
          tone="blue"
          active={bucketFilter === "week"}
          onClick={() => selectBucket("week")}
        />
        <KpiCard
          label="Offen gesamt"
          value={stats.totalOpen}
          tone="gray"
          active={bucketFilter === null && status === "open" && !leadFilter && !search}
          onClick={resetFilters}
        />
      </div>

      {/* Filter-Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen — Titel, Firma, Stadt"
            className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-gray-400" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-100"
          >
            <option value="open">Offen</option>
            <option value="done">Erledigt</option>
            <option value="all">Alle</option>
          </select>
          <select
            value={leadFilter}
            onChange={(e) => setLeadFilter(e.target.value)}
            className="max-w-[180px] rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-100"
          >
            <option value="">Alle Leads</option>
            {leadOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {(search || status !== "open" || leadFilter || bucketFilter) && (
            <button
              onClick={resetFilters}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
            >
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Bulk-Actions Bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 backdrop-blur dark:bg-primary/10">
          <span className="text-sm font-medium">
            {selected.size} ausgewählt
          </span>
          <div className="ml-auto flex gap-2">
            <button
              disabled={pending}
              onClick={() => runBulk(() => bulkCompleteTodos(selectedIds), `${selected.size} ToDos erledigt`)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              Erledigen
            </button>
            <button
              disabled={pending}
              onClick={() => runBulk(() => bulkRescheduleTodos(selectedIds, 1), "Um 1 Tag verschoben")}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs hover:bg-white dark:border-[#2c2c2e] dark:hover:bg-white/5"
            >
              +1 Tag
            </button>
            <button
              disabled={pending}
              onClick={() => runBulk(() => bulkRescheduleTodos(selectedIds, 7), "Um 1 Woche verschoben")}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs hover:bg-white dark:border-[#2c2c2e] dark:hover:bg-white/5"
            >
              +1 Woche
            </button>
            <button
              disabled={pending}
              onClick={() => {
                if (!confirm(`${selected.size} ToDos löschen?`)) return;
                runBulk(() => bulkDeleteTodos(selectedIds), `${selected.size} ToDos gelöscht`);
              }}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/20"
            >
              Löschen
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Esc
            </button>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          </div>
        </div>
      )}

      {/* Buckets */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState search={search} status={status} totalOpen={stats.totalOpen} filtered={!!bucketFilter || !!leadFilter} />
        ) : (
          <>
            {BUCKETS_OPEN.map((b) => {
              const items = grouped.get(b.key) ?? [];
              if (items.length === 0) return null;
              return (
                <BucketSection
                  key={b.key}
                  label={b.label}
                  count={items.length}
                  tone={b.tone}
                  open={openBuckets.has(b.key)}
                  onToggle={() => toggleBucket(b.key)}
                >
                  <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
                    {items.map((t) => (
                      <li key={t.id}>
                        <TodoRow
                          todo={t}
                          selected={selected.has(t.id)}
                          onSelectChange={(s) => toggleSelect(t.id, s)}
                        />
                      </li>
                    ))}
                  </ul>
                </BucketSection>
              );
            })}
            {(() => {
              const doneToday = grouped.get("done_today") ?? [];
              const doneEarlier = grouped.get("done_earlier") ?? [];
              const allDone = [...doneToday, ...doneEarlier];
              if (allDone.length === 0) return null;
              return (
                <BucketSection
                  label={doneToday.length > 0 ? BUCKET_DONE.label : "Erledigt"}
                  count={allDone.length}
                  tone={BUCKET_DONE.tone}
                  open={openBuckets.has("done_today")}
                  onToggle={() => toggleBucket("done_today")}
                >
                  <ul className="divide-y divide-gray-100 dark:divide-[#2c2c2e]">
                    {allDone.map((t) => (
                      <li key={t.id}>
                        <TodoRow
                          todo={t}
                          selected={selected.has(t.id)}
                          onSelectChange={(s) => toggleSelect(t.id, s)}
                        />
                      </li>
                    ))}
                  </ul>
                </BucketSection>
              );
            })()}
          </>
        )}
      </div>

      {/* Footer-Tipp */}
      <p className="pt-4 text-center text-[11px] text-gray-400">
        Tipp: <kbd className="rounded border border-gray-200 px-1 dark:border-[#2c2c2e]">n</kbd> für neues ToDo ·{" "}
        <kbd className="rounded border border-gray-200 px-1 dark:border-[#2c2c2e]">Esc</kbd> hebt Auswahl auf
      </p>
    </div>
  );
}

function BucketSection({
  label,
  count,
  tone,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  tone: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
        <span className={`uppercase tracking-wide text-[11px] ${tone}`}>{label}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/5 dark:text-gray-400">
          {count}
        </span>
      </button>
      {open && children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "blue" | "gray";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClasses: Record<typeof tone, string> = {
    red: value > 0 ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/15 dark:text-red-300" : "",
    amber: value > 0 ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300" : "",
    blue: value > 0 ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/15 dark:text-blue-300" : "",
    gray: "",
  };
  const ringTone: Record<typeof tone, string> = {
    red: "ring-red-400 dark:ring-red-500",
    amber: "ring-amber-400 dark:ring-amber-500",
    blue: "ring-blue-400 dark:ring-blue-500",
    gray: "ring-primary",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border p-3 text-left transition hover:border-primary/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${toneClasses[tone]} border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e] ${
        active ? `ring-2 ${ringTone[tone]}` : ""
      }`}
    >
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </button>
  );
}

function EmptyState({ search, status, totalOpen, filtered }: { search: string; status: StatusFilter; totalOpen: number; filtered: boolean }) {
  if (search || status !== "open" || filtered) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center dark:border-[#2c2c2e]">
        <p className="text-sm text-gray-500 dark:text-gray-400">Keine Treffer mit diesen Filtern.</p>
      </div>
    );
  }
  if (totalOpen === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center dark:border-[#2c2c2e]">
        <p className="text-sm text-gray-700 dark:text-gray-300">🎯 Heute alles erledigt. Schöner Tag.</p>
        <p className="mt-1 text-xs text-gray-400">
          Tipp: <kbd className="rounded border border-gray-200 px-1 dark:border-[#2c2c2e]">n</kbd> drücken und neues ToDo anlegen.
        </p>
      </div>
    );
  }
  return null;
}
