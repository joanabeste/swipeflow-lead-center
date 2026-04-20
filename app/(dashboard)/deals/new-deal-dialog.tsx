"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Building2, Check, Search } from "lucide-react";
import type { DealStage } from "@/lib/deals/types";
import { createDealAction, searchLeadsForDeal } from "./actions";
import { useToastContext } from "../toast-provider";

interface Props {
  stages: DealStage[];
  team: { id: string; name: string; avatarUrl: string | null }[];
  preselectedLead?: { id: string; company_name: string } | null;
  onClose: () => void;
}

export function NewDealDialog({ stages, team, preselectedLead = null, onClose }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  const [selectedLead, setSelectedLead] = useState<{ id: string; company_name: string } | null>(
    preselectedLead,
  );
  const [newCompanyName, setNewCompanyName] = useState("");
  const [mode, setMode] = useState<"existing" | "new">(preselectedLead ? "existing" : "existing");

  const [title, setTitle] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [description, setDescription] = useState("");
  const [stageId, setStageId] = useState(stages.find((s) => s.kind === "open")?.id ?? stages[0]?.id ?? "");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [expectedCloseDate, setExpectedCloseDate] = useState<string>("");
  const [probability, setProbability] = useState<string>("");
  const [nextStep, setNextStep] = useState<string>("");
  const [lastFollowupAt, setLastFollowupAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const probNum = probability.trim() === "" ? null : Number(probability);
      const res = await createDealAction({
        leadId: mode === "existing" ? selectedLead?.id : undefined,
        newCompanyName: mode === "new" ? newCompanyName : undefined,
        title,
        description,
        amountRaw,
        stageId,
        assignedTo: assignedTo || null,
        expectedCloseDate: expectedCloseDate || null,
        probability: probNum,
        nextStep: nextStep.trim() || null,
        lastFollowupAt: lastFollowupAt || null,
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        addToast("Deal angelegt.", "success");
        router.refresh();
        router.push(`/deals/${res.dealId}`);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <h2 className="text-lg font-semibold">Neuer Deal</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Firma: bestehend oder neu */}
          {!preselectedLead && (
            <div>
              <div className="mb-1.5 flex rounded-md border border-gray-200 p-0.5 text-xs dark:border-[#2c2c2e]">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className={`flex-1 rounded px-2 py-1 ${
                    mode === "existing" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
                  }`}
                >
                  Bestehende Firma
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className={`flex-1 rounded px-2 py-1 ${
                    mode === "new" ? "bg-gray-200 font-medium dark:bg-white/10" : "text-gray-500"
                  }`}
                >
                  Neue Firma
                </button>
              </div>
              {mode === "existing" ? (
                <LeadAutocomplete
                  selected={selectedLead}
                  onSelect={setSelectedLead}
                />
              ) : (
                <div>
                  <input
                    type="text"
                    required
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Neuer Firmenname"
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Wird als neuer Lead im CRM angelegt.
                  </p>
                </div>
              )}
            </div>
          )}

          {preselectedLead && (
            <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm dark:border-[#2c2c2e] dark:bg-white/[0.02]">
              <span className="text-xs text-gray-500">Firma: </span>
              <span className="font-medium">{preselectedLead.company_name}</span>
            </div>
          )}

          <div>
            <label htmlFor="d-title" className="block text-sm font-medium">Titel</label>
            <input
              id="d-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Website-Relaunch"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="d-amount" className="block text-sm font-medium">Volumen (€)</label>
              <input
                id="d-amount"
                type="text"
                required
                value={amountRaw}
                onChange={(e) => setAmountRaw(e.target.value)}
                placeholder="3000"
                inputMode="decimal"
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="d-stage" className="block text-sm font-medium">Stage</label>
              <select
                id="d-stage"
                required
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="d-assignee" className="block text-sm font-medium">Zuständig</label>
              <select
                id="d-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              >
                <option value="">— Ich (Default) —</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || "Ohne Name"}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="d-close" className="block text-sm font-medium">Erwartetes Abschluss-Datum</label>
              <input
                id="d-close"
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="d-prob" className="block text-sm font-medium">Closing-Wahrscheinlichkeit (%)</label>
              <input
                id="d-prob"
                type="number"
                min={0}
                max={100}
                value={probability}
                onChange={(e) => setProbability(e.target.value)}
                placeholder="z.B. 65"
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="d-lastfu" className="block text-sm font-medium">Letzter FollowUp</label>
              <input
                id="d-lastfu"
                type="date"
                value={lastFollowupAt}
                onChange={(e) => setLastFollowupAt(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="d-nextstep" className="block text-sm font-medium">Nächster Schritt (optional)</label>
            <input
              id="d-nextstep"
              type="text"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder="z.B. Ersttermin am 12.03., Urlaub bis 16.03., …"
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="d-desc" className="block text-sm font-medium">Beschreibung (optional)</label>
            <textarea
              id="d-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 block w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={
                pending ||
                !title.trim() ||
                !amountRaw.trim() ||
                (mode === "existing" && !selectedLead && !preselectedLead) ||
                (mode === "new" && !newCompanyName.trim())
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {pending ? "Anlegen…" : "Deal anlegen"}
            </button>
          </div>
        </form>
      </div>
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
