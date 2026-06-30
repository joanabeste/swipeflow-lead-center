"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  ExternalLink,
  Pencil,
  CalendarClock,
  UserCog,
  Ban,
  RotateCcw,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import { useToastContext } from "@/app/(dashboard)/toast-provider";
import { useDialog } from "@/components/dialog";
import {
  voidCommissionEvent,
  restoreCommissionEvent,
  reassignCommissionEvent,
  updateCommissionEventAmount,
  updateCommissionEventEarnedAt,
  confirmCommissionEvent,
  unconfirmCommissionEvent,
  createManualCommissionEvent,
  searchLeadsForCommission,
} from "./commission-actions";

export interface LedgerEvent {
  id: string;
  amount_cents: number;
  currency: string;
  earned_at: string;
  voided_at: string | null;
  void_reason: string | null;
  confirmed_at: string | null;
  rule_id: string | null;
  lead_id: string;
  user_id: string;
  note: string | null;
  leads: { company_name: string } | null;
  profiles: { name: string | null; email: string } | null;
  commission_rules: { name: string } | null;
}

interface ProfileLite {
  id: string;
  name: string | null;
  email: string;
}

interface MonthNav {
  currentMonth: string; // YYYY-MM
  prevMonth: string;
  nextMonth: string;
  monthLabel: string;
}

function fmtMoney(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function personName(p: ProfileLite | { name: string | null; email: string } | null): string {
  if (!p) return "—";
  return p.name || p.email;
}

type EventStatus = "prospective" | "confirmed" | "voided";

function eventStatus(e: LedgerEvent): EventStatus {
  if (e.voided_at) return "voided";
  if (e.confirmed_at) return "confirmed";
  return "prospective";
}

export function CommissionLedger({
  events,
  profiles,
  nav,
  tableMissing,
}: {
  events: LedgerEvent[];
  profiles: ProfileLite[];
  nav: MonthNav;
  tableMissing?: boolean;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const dialog = useDialog();
  const [, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Client-Filter (Monat kommt vom Server per ?month=).
  const [userFilter, setUserFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EventStatus>("all");

  const profileById = useMemo(
    () => Object.fromEntries(profiles.map((p) => [p.id, p] as const)),
    [profiles],
  );

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (userFilter !== "all" && e.user_id !== userFilter) return false;
        if (statusFilter !== "all" && eventStatus(e) !== statusFilter) return false;
        return true;
      }),
    [events, userFilter, statusFilter],
  );

  // Summen (immer auf Basis aller Monats-Events, unabhaengig vom Filter).
  const activeEvents = useMemo(() => events.filter((e) => !e.voided_at), [events]);
  const prospectiveCents = activeEvents
    .filter((e) => !e.confirmed_at)
    .reduce((s, e) => s + e.amount_cents, 0);
  const confirmedCents = activeEvents
    .filter((e) => e.confirmed_at)
    .reduce((s, e) => s + e.amount_cents, 0);
  const voidedCount = events.length - activeEvents.length;

  const perPerson = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of activeEvents) map.set(e.user_id, (map.get(e.user_id) ?? 0) + e.amount_cents);
    return [...map.entries()]
      .map(([uid, cents]) => ({
        uid,
        name: personName(profileById[uid] ?? e2profile(events, uid)),
        cents,
      }))
      .sort((a, b) => b.cents - a.cents);
  }, [activeEvents, profileById, events]);

  function run(id: string, fn: () => Promise<{ success: true } | { error: string }>, ok: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if ("error" in res) {
        addToast(`Fehler: ${res.error}`, "error");
        return;
      }
      addToast(ok, "success");
      router.refresh();
    });
  }

  async function onReassign(e: LedgerEvent) {
    const newUserId = await dialog.show<string>({
      render: (close) => (
        <ReassignPicker profiles={profiles} currentId={e.user_id} onClose={close} />
      ),
    });
    if (!newUserId || newUserId === e.user_id) return;
    run(e.id, () => reassignCommissionEvent(e.id, newUserId), "Empfänger geändert.");
  }

  async function onAmount(e: LedgerEvent) {
    const val = await dialog.prompt({
      title: "Betrag anpassen",
      body: `${e.leads?.company_name ?? "Lead"} · ${personName(e.profiles)}`,
      defaultValue: (e.amount_cents / 100).toFixed(2),
      placeholder: "z.B. 50.00",
      validate: (v) => {
        const n = parseFloat(v.replace(",", "."));
        return !Number.isFinite(n) || n < 0 ? "Ungültiger Betrag." : null;
      },
    });
    if (val == null) return;
    const cents = Math.round(parseFloat(val.replace(",", ".")) * 100);
    run(e.id, () => updateCommissionEventAmount(e.id, cents), "Betrag geändert.");
  }

  async function onEarnedAt(e: LedgerEvent) {
    const val = await dialog.prompt({
      title: "Datum / Monat ändern",
      body: "Bestimmt, welchem Monat die Provision zugeordnet wird (Format JJJJ-MM-TT).",
      defaultValue: new Date(e.earned_at).toISOString().slice(0, 10),
      placeholder: "2026-06-30",
      validate: (v) =>
        /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && !isNaN(new Date(v).getTime())
          ? null
          : "Ungültiges Datum (JJJJ-MM-TT).",
    });
    if (val == null) return;
    run(
      e.id,
      () => updateCommissionEventEarnedAt(e.id, `${val.trim()}T12:00:00`),
      "Datum geändert.",
    );
  }

  async function onVoid(e: LedgerEvent) {
    const reason = await dialog.prompt({
      title: "Provision stornieren",
      body: `${e.leads?.company_name ?? "Lead"} · ${personName(e.profiles)} · ${fmtMoney(
        e.amount_cents,
      )}. Zählt danach nicht mehr zur Auszahlung; lässt sich reaktivieren.`,
      placeholder: "Grund (optional), z.B. Termin nicht stattgefunden",
      confirmLabel: "Stornieren",
    });
    if (reason == null) return; // abgebrochen
    run(e.id, () => voidCommissionEvent(e.id, reason), "Provision storniert.");
  }

  async function onRestore(e: LedgerEvent) {
    const ok = await dialog.confirm({
      title: "Storno aufheben?",
      body: "Die Provision zählt danach wieder zur Auszahlung.",
      confirmLabel: "Reaktivieren",
    });
    if (!ok) return;
    run(e.id, () => restoreCommissionEvent(e.id), "Provision reaktiviert.");
  }

  function onConfirm(e: LedgerEvent) {
    run(e.id, () => confirmCommissionEvent(e.id), "Provision bestätigt.");
  }

  async function onUnconfirm(e: LedgerEvent) {
    const ok = await dialog.confirm({
      title: "Bestätigung aufheben?",
      body: "Die Provision gilt danach wieder als voraussichtlich.",
      confirmLabel: "Aufheben",
    });
    if (!ok) return;
    run(e.id, () => unconfirmCommissionEvent(e.id), "Bestätigung aufgehoben.");
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Gebuchte Provisionen</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Alle gebuchten Provisionen pro Monat — stornieren, Empfänger/Betrag/Datum ändern oder
            manuell anlegen. Änderungen wirken sofort in der persönlichen Auszahlung.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-gray-900 hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            Provision manuell anlegen
          </button>
        )}
      </div>

      {/* Toolbar: Monat + Filter */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
          <Link
            href={`/admin/provisionen?month=${nav.prevMonth}`}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            ←
          </Link>
          <span className="border-x border-gray-200 px-4 py-2 text-sm font-medium dark:border-[#2c2c2e]/60">
            {nav.monthLabel}
          </span>
          <Link
            href={`/admin/provisionen?month=${nav.nextMonth}`}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            →
          </Link>
        </div>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className={selectCls}
        >
          <option value="all">Alle Mitarbeiter</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {personName(p)}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | EventStatus)}
          className={selectCls}
        >
          <option value="all">Alle</option>
          <option value="prospective">Voraussichtlich</option>
          <option value="confirmed">Bestätigt</option>
          <option value="voided">Storniert</option>
        </select>
      </div>

      {/* Summen */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Voraussichtlich" value={fmtMoney(prospectiveCents)} accent="amber" />
        <SummaryCard label="Bestätigt" value={fmtMoney(confirmedCents)} accent="green" />
        <SummaryCard
          label="Events"
          value={`${events.length}`}
          sub={voidedCount > 0 ? `${voidedCount} storniert` : undefined}
        />
      </div>

      {perPerson.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {perPerson.map((p) => (
            <span
              key={p.uid}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs dark:border-[#2c2c2e] dark:bg-[#232325]"
            >
              <span className="font-medium">{p.name}</span>
              <span className="tabular-nums text-gray-500">{fmtMoney(p.cents)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Anlegen-Formular */}
      {adding && (
        <div className="mt-4">
          <ManualForm
            profiles={profiles}
            defaultMonth={nav.currentMonth}
            onDone={() => {
              setAdding(false);
              router.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Tabelle */}
      <div className="mt-4 overflow-x-auto">
        {tableMissing ? (
          <p className="py-6 text-sm text-gray-400">
            Tabelle/Spalten fehlen — Migration 068/069 muss in Supabase ausgeführt werden.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-sm text-gray-400">Keine Provisionen für diesen Monat/Filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-[#161618]">
              <tr>
                <th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-left">Lead</th>
                <th className="px-3 py-2 text-left">Empfänger</th>
                <th className="px-3 py-2 text-left">Grund</th>
                <th className="px-3 py-2 text-right">Betrag</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2c2c2e]/40">
              {filtered.map((e) => {
                const status = eventStatus(e);
                const voided = status === "voided";
                const busy = busyId === e.id;
                return (
                  <tr key={e.id} className={voided ? "opacity-55" : undefined}>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{fmtDate(e.earned_at)}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/crm/${e.lead_id}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {e.leads?.company_name ?? e.lead_id.slice(0, 8)}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="px-3 py-2">{personName(e.profiles)}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                      {e.rule_id
                        ? e.commission_rules?.name ?? "—"
                        : `Manuell${e.note ? `: ${e.note}` : ""}`}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        voided ? "line-through" : ""
                      }`}
                    >
                      {fmtMoney(e.amount_cents)}
                    </td>
                    <td className="px-3 py-2" title={voided ? e.void_reason ?? undefined : undefined}>
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {voided ? (
                          <IconBtn title="Reaktivieren" onClick={() => onRestore(e)} disabled={busy}>
                            <RotateCcw className="h-4 w-4" />
                          </IconBtn>
                        ) : (
                          <>
                            {status === "confirmed" ? (
                              <IconBtn title="Bestätigung aufheben" onClick={() => onUnconfirm(e)} disabled={busy}>
                                <Undo2 className="h-4 w-4" />
                              </IconBtn>
                            ) : (
                              <IconBtn title="Bestätigen" onClick={() => onConfirm(e)} disabled={busy}>
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                              </IconBtn>
                            )}
                            <IconBtn title="Empfänger ändern" onClick={() => onReassign(e)} disabled={busy}>
                              <UserCog className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn title="Betrag anpassen" onClick={() => onAmount(e)} disabled={busy}>
                              <Pencil className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn title="Datum / Monat ändern" onClick={() => onEarnedAt(e)} disabled={busy}>
                              <CalendarClock className="h-4 w-4" />
                            </IconBtn>
                            <IconBtn title="Stornieren" danger onClick={() => onVoid(e)} disabled={busy}>
                              <Ban className="h-4 w-4" />
                            </IconBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// Hilfs-Lookup fuer Namen, falls der Empfaenger nicht in den aktiven Profilen
// ist (z.B. inaktiv geworden): aus dem eingebetteten profiles-Feld der Events.
function e2profile(events: LedgerEvent[], uid: string): { name: string | null; email: string } | null {
  return events.find((e) => e.user_id === uid)?.profiles ?? null;
}

const selectCls =
  "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]";

const inputCls =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e]";

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "amber" | "green";
}) {
  const accentCls =
    accent === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : accent === "green"
      ? "text-green-600 dark:text-green-400"
      : "";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/60 dark:bg-[#161618]">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accentCls}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: EventStatus }) {
  if (status === "voided")
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
        Storniert
      </span>
    );
  if (status === "confirmed")
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
        Bestätigt
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
      Voraussichtlich
    </span>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded p-1.5 disabled:opacity-40 ${
        danger
          ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

// ─── Empfaenger-Auswahl (Dialog) ────────────────────────────────

function ReassignPicker({
  profiles,
  currentId,
  onClose,
}: {
  profiles: ProfileLite[];
  currentId: string;
  onClose: (value?: string) => void;
}) {
  const [sel, setSel] = useState(currentId);
  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]/50">
        <h3 className="text-base font-semibold">Empfänger ändern</h3>
        <button onClick={() => onClose(undefined)} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="px-6 py-4">
        <Field label="Neuer Empfänger">
          <select value={sel} onChange={(e) => setSel(e.target.value)} className={inputCls}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3 dark:border-[#2c2c2e]/50">
        <button
          onClick={() => onClose(undefined)}
          className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
        >
          Abbrechen
        </button>
        <button
          onClick={() => onClose(sel)}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-gray-900 hover:bg-primary-dark"
        >
          Übernehmen
        </button>
      </footer>
    </div>
  );
}

// ─── Manuell anlegen ────────────────────────────────────────────

function ManualForm({
  profiles,
  defaultMonth,
  onDone,
  onCancel,
}: {
  profiles: ProfileLite[];
  defaultMonth: string; // YYYY-MM
  onDone: () => void;
  onCancel: () => void;
}) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [leadQuery, setLeadQuery] = useState("");
  const [results, setResults] = useState<{ id: string; company_name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [lead, setLead] = useState<{ id: string; company_name: string } | null>(null);

  const [userId, setUserId] = useState(profiles[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(`${defaultMonth}-01`);
  const [note, setNote] = useState("");

  async function doSearch() {
    const q = leadQuery.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const res = await searchLeadsForCommission(q);
    setSearching(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setResults(res.leads);
  }

  function submit() {
    setError(null);
    if (!lead) {
      setError("Bitte einen Lead auswählen.");
      return;
    }
    const euros = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(euros) || euros < 0) {
      setError("Ungültiger Betrag.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
      setError("Ungültiges Datum.");
      return;
    }
    startTransition(async () => {
      const res = await createManualCommissionEvent({
        leadId: lead.id,
        userId,
        amountCents: Math.round(euros * 100),
        note,
        earnedAtIso: `${date}T12:00:00`,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      addToast("Provision angelegt.", "success");
      onDone();
    });
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-[#2c2c2e] dark:bg-[#232325]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Lead">
            {lead ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
                <span className="truncate">{lead.company_name}</span>
                <button
                  type="button"
                  onClick={() => setLead(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={leadQuery}
                  onChange={(e) => setLeadQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      doSearch();
                    }
                  }}
                  placeholder="Firmenname suchen…"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={doSearch}
                  disabled={searching || leadQuery.trim().length < 2}
                  className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
                >
                  {searching ? "…" : "Suchen"}
                </button>
              </div>
            )}
          </Field>
          {!lead && results.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-auto rounded-md border border-gray-200 bg-white text-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setLead(r);
                      setResults([]);
                      setLeadQuery("");
                    }}
                    className="block w-full px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    {r.company_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Field label="Empfänger">
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {personName(p)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Betrag (€)">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="50.00"
            className={inputCls}
          />
        </Field>
        <Field label="Datum (Monat)">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Notiz (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z.B. Bonus / Sonderfall"
            className={inputCls}
          />
        </Field>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <X className="h-4 w-4" />
          Abbrechen
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-gray-900 disabled:opacity-50 hover:bg-primary-dark"
        >
          {pending ? "Anlegen…" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}
