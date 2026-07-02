"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Search, X } from "lucide-react";
import { searchLeadsForDeal } from "../actions";

export type CompanyValue =
  | { mode: "existing"; lead: { id: string; company_name: string } | null }
  | { mode: "new"; name: string };

/**
 * Firmen-Auswahl für Deals: bestehende CRM-Firma (Lead) verknüpfen ODER
 * freien neuen Firmennamen als Snapshot eingeben. Wird sowohl im
 * „Deal anlegen"-Dialog als auch im Deal-Bearbeiten-Modus verwendet.
 */
export function CompanyPicker({
  value,
  onChange,
  newHint = "Wird als neuer Lead im CRM angelegt.",
}: {
  value: CompanyValue;
  onChange: (v: CompanyValue) => void;
  newHint?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex rounded-md border border-gray-200 p-0.5 text-xs dark:border-[#2c2c2e]">
        <button
          type="button"
          onClick={() => value.mode !== "existing" && onChange({ mode: "existing", lead: null })}
          className={`flex-1 rounded px-2 py-1 ${
            value.mode === "existing" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
          }`}
        >
          Bestehende Firma
        </button>
        <button
          type="button"
          onClick={() => value.mode !== "new" && onChange({ mode: "new", name: "" })}
          className={`flex-1 rounded px-2 py-1 ${
            value.mode === "new" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
          }`}
        >
          Neue Firma
        </button>
      </div>
      {value.mode === "existing" ? (
        <LeadAutocomplete
          selected={value.lead}
          onSelect={(lead) => onChange({ mode: "existing", lead })}
        />
      ) : (
        <div>
          <input
            type="text"
            value={value.name}
            onChange={(e) => onChange({ mode: "new", name: e.target.value })}
            placeholder="Neuer Firmenname"
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{newHint}</p>
        </div>
      )}
    </div>
  );
}

function LeadAutocomplete({
  selected,
  onSelect,
}: {
  selected: { id: string; company_name: string } | null;
  onSelect: (lead: { id: string; company_name: string } | null) => void;
}) {
  const [query, setQuery] = useState(selected?.company_name ?? "");
  const [results, setResults] = useState<{ id: string; company_name: string; city: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query === selected?.company_name) {
      // Leeren im nächsten Tick, damit setState nicht synchron im Effect passiert.
      const t = setTimeout(() => setResults([]), 0);
      return () => clearTimeout(t);
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchLeadsForDeal(query);
      setResults(res.leads);
      setSearching(false);
      setOpen(true);
    }, 200);
  }, [query, selected]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-2.5 py-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary dark:border-[#2c2c2e] dark:bg-[#232325]">
        {selected ? (
          <>
            <Building2 className="h-3.5 w-3.5 text-gray-400" />
            <span className="flex-1 text-sm">{selected.company_name}</span>
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setQuery("");
              }}
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Search className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Firma suchen…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </>
        )}
      </div>
      {open && !selected && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
          {searching && <p className="px-3 py-2 text-xs text-gray-400">Suche…</p>}
          {!searching && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400">Keine Treffer</p>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onSelect({ id: r.id, company_name: r.company_name });
                setOpen(false);
              }}
              className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
            >
              <p className="font-medium">{r.company_name}</p>
              {r.city && <p className="text-xs text-gray-500 dark:text-gray-400">{r.city}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
