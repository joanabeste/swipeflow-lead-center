"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchLeads } from "./leads/actions";
import { searchLearning, type LearningSearchHit } from "./learning/_actions/search";

interface LeadResult {
  id: string;
  company_name: string;
  website: string | null;
  city: string | null;
  status: string;
}

type CombinedResult =
  | { kind: "lead"; lead: LeadResult }
  | { kind: "learning"; hit: LearningSearchHit };

const statusLabels: Record<string, string> = {
  imported: "Importiert",
  enriched: "Angereichert",
  qualified: "Qualifiziert",
  exported: "Exportiert",
  cancelled: "Ausgeschlossen",
  filtered: "Gefiltert",
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CombinedResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Keyboard shortcut: "/" to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const [leads, learning] = await Promise.all([searchLeads(value), searchLearning(value)]);
        const combined: CombinedResult[] = [
          ...leads.map((l) => ({ kind: "lead" as const, lead: l })),
          ...learning.map((h) => ({ kind: "learning" as const, hit: h })),
        ];
        setResults(combined);
        setOpen(true);
      });
    }, 300);
  }

  function handleSelect(r: CombinedResult) {
    setOpen(false);
    setQuery("");
    if (r.kind === "lead") {
      router.push(`/leads/${r.lead.id}`);
    } else {
      const target = r.hit.lesson_id
        ? `/learning/${r.hit.course_slug}/${r.hit.lesson_id}`
        : `/learning/${r.hit.course_slug}`;
      router.push(target);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Suche… (Taste /)"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:focus:bg-[#161618] dark:placeholder-gray-500"
        />
        {isPending && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          {results.map((r, i) => {
            if (r.kind === "lead") {
              return (
                <button
                  key={`lead-${r.lead.id}`}
                  onClick={() => handleSelect(r)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition first:rounded-t-xl last:rounded-b-xl hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Lead</span>
                    <span className="font-medium">{r.lead.company_name}</span>
                    {r.lead.city && <span className="text-xs text-gray-400">{r.lead.city}</span>}
                  </div>
                  <span className="text-xs text-gray-400">{statusLabels[r.lead.status] ?? r.lead.status}</span>
                </button>
              );
            }
            return (
              <button
                key={`learning-${i}`}
                onClick={() => handleSelect(r)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition first:rounded-t-xl last:rounded-b-xl hover:bg-gray-50 dark:hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Learning</span>
                  <span className="font-medium">{r.hit.lesson_title ?? r.hit.course_title}</span>
                  {r.hit.lesson_title && <span className="text-xs text-gray-400">in {r.hit.course_title}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !isPending && (
        <div className="absolute top-full z-30 mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-center text-sm text-gray-400 shadow-lg dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          Keine Ergebnisse
        </div>
      )}
    </div>
  );
}
