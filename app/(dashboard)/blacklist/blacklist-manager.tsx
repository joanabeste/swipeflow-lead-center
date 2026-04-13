"use client";

import { useState, useMemo, useActionState } from "react";
import { Plus, Trash2, Search, ToggleLeft, ToggleRight } from "lucide-react";
import type { BlacklistEntry, BlacklistRule } from "@/lib/types";
import {
  addBlacklistEntry,
  deleteBlacklistEntry,
  addBlacklistRule,
  toggleBlacklistRule,
  deleteBlacklistRule,
} from "./actions";

interface Props {
  entries: BlacklistEntry[];
  rules: BlacklistRule[];
}

const PAGE_SIZE = 20;

const matchTypeLabels: Record<string, string> = {
  name: "Firmenname",
  domain: "Domain",
  register_id: "Register-ID",
};

export function BlacklistManager({ entries, rules }: Props) {
  const [tab, setTab] = useState<"entries" | "rules">("entries");
  const [entryState, entryAction, entryPending] = useActionState(addBlacklistEntry, undefined);
  const [ruleState, ruleAction, rulePending] = useActionState(addBlacklistRule, undefined);

  // Entries: Suche, Typ-Filter, Pagination
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (typeFilter) {
      result = result.filter((e) => e.match_type === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.match_value.toLowerCase().includes(q) ||
          (e.reason ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [entries, typeFilter, search]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const paginatedEntries = filteredEntries.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  // Counts by type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { name: 0, domain: 0, register_id: 0 };
    for (const e of entries) counts[e.match_type] = (counts[e.match_type] ?? 0) + 1;
    return counts;
  }, [entries]);

  return (
    <div className="mt-6 space-y-6">
      {/* Statistik-Karten */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-2xl font-bold">{entries.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Blacklist gesamt</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-2xl font-bold">{typeCounts.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Firmennamen</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-2xl font-bold">{typeCounts.domain}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Domains</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-2xl font-bold">{rules.filter((r) => r.is_active).length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Filterregeln aktiv</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setTab("entries")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "entries"
              ? "border-b-2 border-primary text-primary"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          Manuelle Blacklist
        </button>
        <button
          onClick={() => setTab("rules")}
          className={`px-4 py-2 text-sm font-medium ${
            tab === "rules"
              ? "border-b-2 border-primary text-primary"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          Filterregeln ({rules.length})
        </button>
      </div>

      {/* === Manuelle Einträge === */}
      {tab === "entries" && (
        <div className="space-y-3">
          {/* Toolbar: Suche + Filter + Hinzufügen */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Blacklist durchsuchen…"
                className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Alle Typen</option>
              <option value="name">Firmenname ({typeCounts.name})</option>
              <option value="domain">Domain ({typeCounts.domain})</option>
              <option value="register_id">Register-ID ({typeCounts.register_id})</option>
            </select>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" />
              Hinzufügen
            </button>
          </div>

          {/* Formular (ausklappbar) */}
          {showAddForm && (
            <form action={entryAction} className="flex items-end gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 dark:border-primary/20 dark:bg-primary/5">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Typ</label>
                <select
                  name="match_type"
                  className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="name">Firmenname</option>
                  <option value="domain">Domain</option>
                  <option value="register_id">Register-ID</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Wert</label>
                <input
                  name="match_value"
                  required
                  placeholder="z.B. beispiel-konzern.de"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Grund (optional)</label>
                <input
                  name="reason"
                  placeholder="z.B. Großkonzern"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
              <button
                type="submit"
                disabled={entryPending}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {entryPending ? "Wird gespeichert…" : "Speichern"}
              </button>
            </form>
          )}

          {entryState?.error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{entryState.error}</div>
          )}

          {/* Tabelle */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="w-24 px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Typ</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Wert</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Grund</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {paginatedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      {search || typeFilter ? "Keine Einträge für diesen Filter." : "Keine Blacklist-Einträge vorhanden."}
                    </td>
                  </tr>
                ) : (
                  paginatedEntries.map((entry) => (
                    <tr key={entry.id} className="group">
                      <td className="px-4 py-2 text-xs">
                        <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                          entry.match_type === "name"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : entry.match_type === "domain"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        }`}>
                          {matchTypeLabels[entry.match_type]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm font-medium">{entry.match_value}</td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{entry.reason ?? "–"}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => deleteBlacklistEntry(entry.id)}
                          className="text-red-500 opacity-0 transition hover:text-red-700 group-hover:opacity-100 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                {filteredEntries.length} Einträge — Seite {page} von {totalPages}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                  // Show first pages, current page area, and last page
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        page === pageNum
                          ? "bg-primary text-white"
                          : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 10 && (
                  <span className="px-1 text-xs text-gray-400">… {totalPages}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === Filterregeln === */}
      {tab === "rules" && (
        <div className="space-y-3">
          <form action={ruleAction} className="flex items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name</label>
              <input
                name="name"
                required
                placeholder="z.B. Konzerne filtern"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Feld</label>
              <select
                name="field"
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="company_name">Firmenname</option>
                <option value="legal_form">Rechtsform</option>
                <option value="company_size">Größe</option>
                <option value="industry">Branche</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Operator</label>
              <select
                name="operator"
                className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="contains">enthält</option>
                <option value="equals">gleich</option>
                <option value="starts_with">beginnt mit</option>
                <option value="in_list">in Liste</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Wert</label>
              <input
                name="value"
                required
                placeholder='z.B. Konzern oder ["AG","SE"]'
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <button
              type="submit"
              disabled={rulePending}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Hinzufügen
            </button>
          </form>

          {ruleState?.error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">{ruleState.error}</div>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Bedingung</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Aktiv</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                      Keine Filterregeln vorhanden.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="group">
                      <td className="px-4 py-2.5 text-sm font-medium">{rule.name}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                        {rule.field} {rule.operator} &quot;{rule.value}&quot;
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => toggleBlacklistRule(rule.id, !rule.is_active)}>
                          {rule.is_active ? (
                            <ToggleRight className="h-5 w-5 text-green-600 dark:text-green-400" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => deleteBlacklistRule(rule.id)}
                          className="text-red-500 opacity-0 transition hover:text-red-700 group-hover:opacity-100 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
