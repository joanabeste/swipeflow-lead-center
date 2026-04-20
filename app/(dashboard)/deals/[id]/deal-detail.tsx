"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Calendar, User, Trash2, Save, Pencil, Activity } from "lucide-react";
import type { DealChange, DealStage, DealWithRelations } from "@/lib/deals/types";
import { formatAmount } from "@/lib/deals/types";
import { updateDealAction, deleteDealAction } from "../actions";
import { useToastContext } from "../../toast-provider";

interface Props {
  deal: DealWithRelations;
  stages: DealStage[];
  team: { id: string; name: string; avatarUrl: string | null }[];
  changes: DealChange[];
}

export function DealDetail({ deal, stages, team, changes }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const [title, setTitle] = useState(deal.title);
  const [description, setDescription] = useState(deal.description ?? "");
  const [amountRaw, setAmountRaw] = useState((deal.amountCents / 100).toString());
  const [stageId, setStageId] = useState(deal.stageId);
  const [assignedTo, setAssignedTo] = useState(deal.assignedTo ?? "");
  const [expectedCloseDate, setExpectedCloseDate] = useState(deal.expectedCloseDate ?? "");

  function handleSave() {
    startTransition(async () => {
      const res = await updateDealAction(deal.id, {
        title,
        description,
        amountRaw,
        stageId,
        assignedTo: assignedTo || null,
        expectedCloseDate: expectedCloseDate || null,
      });
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        addToast("Deal aktualisiert.", "success");
        setEditing(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!confirm(`Deal „${deal.title}" wirklich löschen?`)) return;
    startDelete(async () => {
      const res = await deleteDealAction(deal.id);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Deal gelöscht.", "success");
        router.push("/deals");
      }
    });
  }

  const activeStages = stages.filter((s) => s.isActive || s.id === stageId);
  const currentStage = stages.find((s) => s.id === deal.stageId);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        {/* Header-Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {editing ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xl font-bold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
                />
              ) : (
                <h1 className="text-xl font-bold">{deal.title}</h1>
              )}
              <Link
                href={`/crm/${deal.leadId}`}
                className="mt-1 inline-flex items-center gap-1 text-sm text-gray-600 hover:underline dark:text-gray-300"
              >
                <Building2 className="h-3.5 w-3.5" />
                {deal.company_name}
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setTitle(deal.title);
                      setDescription(deal.description ?? "");
                      setAmountRaw((deal.amountCents / 100).toString());
                      setStageId(deal.stageId);
                      setAssignedTo(deal.assignedTo ?? "");
                      setExpectedCloseDate(deal.expectedCloseDate ?? "");
                    }}
                    className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Speichern
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-[#2c2c2e] dark:hover:bg-white/5"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Bearbeiten
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deletePending}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Löschen
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Volumen + Stage */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Volumen
              </p>
              {editing ? (
                <input
                  type="text"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
                />
              ) : (
                <p className="mt-1 text-2xl font-bold text-primary">
                  {formatAmount(deal.amountCents, deal.currency)}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Stage
              </p>
              {editing ? (
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
                >
                  {activeStages.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              ) : (
                <span
                  className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium"
                  style={{ backgroundColor: `${deal.stage_color}20`, color: deal.stage_color }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: deal.stage_color }}
                  />
                  {deal.stage_label}
                </span>
              )}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Zuständig
              </p>
              {editing ? (
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
                >
                  <option value="">— Niemand —</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>{m.name || "Ohne Name"}</option>
                  ))}
                </select>
              ) : (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  {deal.assignee_name ?? "—"}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Erwartetes Abschluss-Datum
              </p>
              {editing ? (
                <input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
                />
              ) : (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {deal.expectedCloseDate
                    ? new Date(deal.expectedCloseDate).toLocaleDateString("de-DE")
                    : "—"}
                </p>
              )}
            </div>
          </div>

          {currentStage && (currentStage.kind === "won" || currentStage.kind === "lost") && deal.actualCloseDate && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Abgeschlossen am {new Date(deal.actualCloseDate).toLocaleDateString("de-DE")}
            </p>
          )}
        </div>

        {/* Beschreibung */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Beschreibung
          </p>
          {editing ? (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="mt-2 w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
            />
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
              {deal.description || <span className="italic text-gray-400">Keine Beschreibung</span>}
            </p>
          )}
        </div>
      </div>

      {/* Historie */}
      <aside className="space-y-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Historie
            </p>
          </div>
          {changes.length === 0 && (
            <p className="text-sm text-gray-400">Noch keine Änderungen.</p>
          )}
          <ul className="space-y-3">
            {changes.map((c) => (
              <li key={c.id} className="relative pl-5">
                <span
                  className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(c.createdAt).toLocaleString("de-DE")}
                  {c.changedByName && <span> · {c.changedByName}</span>}
                </p>
                <p className="mt-0.5 text-sm">
                  <FieldChangeLabel change={c} stages={stages} team={team} />
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Meta
          </p>
          <dl className="mt-2 space-y-1.5 text-xs">
            <MetaRow label="Angelegt" value={new Date(deal.createdAt).toLocaleString("de-DE")} />
            <MetaRow label="Aktualisiert" value={new Date(deal.updatedAt).toLocaleString("de-DE")} />
          </dl>
        </div>
      </aside>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function FieldChangeLabel({
  change,
  stages,
  team,
}: {
  change: DealChange;
  stages: DealStage[];
  team: { id: string; name: string }[];
}) {
  if (change.field === "created") {
    return <>Deal angelegt: <b>{change.newValue}</b></>;
  }
  const labels: Record<string, string> = {
    title: "Titel",
    description: "Beschreibung",
    amount_cents: "Volumen",
    stage_id: "Stage",
    assigned_to: "Zuständig",
    expected_close_date: "Erwartetes Abschluss-Datum",
    actual_close_date: "Abschluss-Datum",
  };
  const label = labels[change.field] ?? change.field;

  function display(v: string | null): string {
    if (!v) return "—";
    if (change.field === "amount_cents") {
      const cents = Number(v);
      if (Number.isFinite(cents)) return formatAmount(cents);
    }
    if (change.field === "stage_id") {
      return stages.find((s) => s.id === v)?.label ?? v;
    }
    if (change.field === "assigned_to") {
      return team.find((m) => m.id === v)?.name ?? v;
    }
    return v;
  }

  return (
    <>
      <b>{label}</b>{" "}
      <span className="text-gray-500 dark:text-gray-400 line-through">{display(change.oldValue)}</span>
      <span className="mx-1 text-gray-400">→</span>
      <span className="font-medium">{display(change.newValue)}</span>
    </>
  );
}

