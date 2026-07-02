"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Check } from "lucide-react";
import type { DealStage } from "@/lib/deals/types";
import { createDealAction } from "./actions";
import { CompanyPicker } from "./_components/company-picker";
import { useToastContext } from "../toast-provider";
import { useConfetti } from "@/components/confetti";

interface Props {
  stages: DealStage[];
  team: { id: string; name: string; avatarUrl: string | null }[];
  preselectedLead?: { id: string; company_name: string } | null;
  onClose: () => void;
}

export function NewDealDialog({ stages, team, preselectedLead = null, onClose }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const fireConfetti = useConfetti();
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

  function handleStageChange(newStageId: string) {
    setStageId(newStageId);
    const newStage = stages.find((s) => s.id === newStageId);
    if (newStage?.kind === "won") setProbability("100");
    else if (newStage?.kind === "lost") setProbability("0");
  }

  function validate(): string | null {
    if (!title.trim()) return "Bitte einen Titel eingeben.";
    if (!amountRaw.trim()) return "Bitte ein Volumen eingeben.";
    if (mode === "existing" && !selectedLead && !preselectedLead) {
      return "Bitte eine bestehende Firma auswählen — oder auf „Neue Firma“ wechseln.";
    }
    if (mode === "new" && !newCompanyName.trim()) {
      return "Bitte den Namen der neuen Firma eingeben.";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
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
        if (stages.find((s) => s.id === stageId)?.kind === "won") fireConfetti();
        router.refresh();
        router.push(`/deals/${res.dealId}`);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
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
            <CompanyPicker
              value={
                mode === "existing"
                  ? { mode: "existing", lead: selectedLead }
                  : { mode: "new", name: newCompanyName }
              }
              onChange={(v) => {
                setMode(v.mode);
                if (v.mode === "existing") setSelectedLead(v.lead);
                else setNewCompanyName(v.name);
              }}
            />
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
                onChange={(e) => handleStageChange(e.target.value)}
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
              disabled={pending}
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
