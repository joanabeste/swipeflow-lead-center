"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import type { CommissionRule, CommissionScope, CustomLeadStatus, Profile, UserRole } from "@/lib/types";
import {
  createCommissionRule,
  deleteCommissionRule,
  toggleCommissionRule,
  updateCommissionRule,
  updateProfileHourlyWage,
  type CommissionRuleInput,
} from "./actions";

type ProfileLite = Pick<Profile, "id" | "name" | "email" | "role" | "hourly_wage_cents">;

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  sales: "Sales",
  viewer: "Viewer",
  employee: "Employee",
};

const ROLES: UserRole[] = ["admin", "sales", "viewer", "employee"];

export function ProvisionenManager({
  rules,
  statuses,
  profiles,
}: {
  rules: CommissionRule[];
  statuses: CustomLeadStatus[];
  profiles: ProfileLite[];
}) {
  return (
    <div className="space-y-8">
      <HourlyWageSection profiles={profiles} />
      <RulesSection rules={rules} statuses={statuses} profiles={profiles} />
    </div>
  );
}

// ─── Stundenlohn ────────────────────────────────────────────────

function HourlyWageSection({ profiles }: { profiles: ProfileLite[] }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <h3 className="font-semibold">Stundenlohn pro Mitarbeiter</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Wird in der Provisions-Übersicht zur Gesamtauszahlung addiert (Stunden × Stundenlohn + Provisionen).
      </p>
      <ul className="mt-4 divide-y divide-gray-100 dark:divide-[#2c2c2e]">
        {profiles.map((p) => (
          <WageRow key={p.id} profile={p} />
        ))}
        {profiles.length === 0 && (
          <li className="py-6 text-center text-sm text-gray-400">Keine aktiven Mitarbeiter.</li>
        )}
      </ul>
    </section>
  );
}

function WageRow({ profile }: { profile: ProfileLite }) {
  const [value, setValue] = useState(
    profile.hourly_wage_cents == null ? "" : (profile.hourly_wage_cents / 100).toFixed(2),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const dirty = (() => {
    const current = profile.hourly_wage_cents == null ? "" : (profile.hourly_wage_cents / 100).toFixed(2);
    return value !== current;
  })();

  function save() {
    setError(null);
    setSaved(false);
    const euros = value.trim() === "" ? null : parseFloat(value.replace(",", "."));
    if (euros !== null && (isNaN(euros) || euros < 0)) {
      setError("Ungültiger Betrag.");
      return;
    }
    startTransition(async () => {
      const res = await updateProfileHourlyWage(profile.id, euros);
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{profile.name || profile.email}</p>
        <p className="truncate text-xs text-gray-400">{ROLE_LABEL[profile.role] ?? profile.role}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder="—"
            className="w-28 rounded-md border border-gray-300 bg-white px-3 py-1.5 pr-8 text-right text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#232325]"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">€/h</span>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white transition disabled:opacity-40 dark:bg-white dark:text-gray-900"
        >
          {pending ? "…" : "Speichern"}
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
        {saved && !dirty && <span className="text-xs text-green-600">✓</span>}
      </div>
    </li>
  );
}

// ─── Regeln ─────────────────────────────────────────────────────

function RulesSection({
  rules,
  statuses,
  profiles,
}: {
  rules: CommissionRule[];
  statuses: CustomLeadStatus[];
  profiles: ProfileLite[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CommissionRule | null>(null);

  function refresh() {
    setAdding(false);
    setEditing(null);
    router.refresh();
  }

  const statusById = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);
  const profileById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p])), [profiles]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-[#2c2c2e]/50 dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Provisions-Regeln</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Auslöser: erreicht ein Lead den angegebenen Status, wird die Provision dem zugewiesenen Mitarbeiter (Lead → &bdquo;Zuständig&ldquo;) gutgeschrieben.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-gray-900 hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            Neue Regel
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-4">
          <RuleForm statuses={statuses} profiles={profiles} onDone={refresh} onCancel={() => setAdding(false)} />
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {rules.length === 0 && !adding && (
          <li className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400 dark:border-[#2c2c2e]">
            Noch keine Regel — lege die erste an.
          </li>
        )}
        {rules.map((rule) =>
          editing?.id === rule.id ? (
            <li key={rule.id}>
              <RuleForm
                statuses={statuses}
                profiles={profiles}
                rule={rule}
                onDone={refresh}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={rule.id}>
              <RuleRow
                rule={rule}
                statusLabel={statusById[rule.trigger_status_id]?.label ?? rule.trigger_status_id}
                statusColor={statusById[rule.trigger_status_id]?.color ?? "#999"}
                userName={
                  rule.scope === "user" && rule.scope_user_id
                    ? profileById[rule.scope_user_id]?.name ?? profileById[rule.scope_user_id]?.email ?? "?"
                    : null
                }
                onEdit={() => setEditing(rule)}
                onChanged={refresh}
              />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function RuleRow({
  rule,
  statusLabel,
  statusColor,
  userName,
  onEdit,
  onChanged,
}: {
  rule: CommissionRule;
  statusLabel: string;
  statusColor: string;
  userName: string | null;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await toggleCommissionRule(rule.id, !rule.is_active);
      onChanged();
    });
  }
  function del() {
    if (!confirm(`Regel "${rule.name}" löschen? Bereits gebuchte Provisions-Events bleiben erhalten? Nein – Events werden mitgelöscht (CASCADE).`))
      return;
    startTransition(async () => {
      await deleteCommissionRule(rule.id);
      onChanged();
    });
  }

  const scopeText =
    rule.scope === "all"
      ? "Alle Mitarbeiter"
      : rule.scope === "role"
      ? `Rolle: ${ROLE_LABEL[rule.scope_role ?? "employee"]}`
      : userName
      ? `Nur: ${userName}`
      : "Nur: ?";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-100 p-3 dark:border-[#2c2c2e]">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{rule.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor }} />
            Trigger: {statusLabel}
          </span>
          <span>·</span>
          <span>{scopeText}</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tabular-nums">{(rule.amount_cents / 100).toFixed(2)} €</span>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={rule.is_active} onChange={toggle} disabled={pending} />
          Aktiv
        </label>
        <button onClick={onEdit} disabled={pending} className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={del} disabled={pending} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function RuleForm({
  statuses,
  profiles,
  rule,
  onDone,
  onCancel,
}: {
  statuses: CustomLeadStatus[];
  profiles: ProfileLite[];
  rule?: CommissionRule;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [statusId, setStatusId] = useState<string>(rule?.trigger_status_id ?? statuses[0]?.id ?? "");
  const [amount, setAmount] = useState<string>(rule ? (rule.amount_cents / 100).toFixed(2) : "");
  const [scope, setScope] = useState<CommissionScope>(rule?.scope ?? "all");
  const [scopeRole, setScopeRole] = useState<UserRole>(rule?.scope_role ?? "sales");
  const [scopeUserId, setScopeUserId] = useState<string>(rule?.scope_user_id ?? profiles[0]?.id ?? "");
  const [active, setActive] = useState(rule?.is_active ?? true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const euros = parseFloat(amount.replace(",", "."));
    if (isNaN(euros) || euros < 0) {
      setError("Ungültiger Betrag.");
      return;
    }
    const input: CommissionRuleInput = {
      name,
      trigger_status_id: statusId,
      amount_euros: euros,
      scope,
      scope_role: scope === "role" ? scopeRole : null,
      scope_user_id: scope === "user" ? scopeUserId : null,
      is_active: active,
    };
    startTransition(async () => {
      const res = rule ? await updateCommissionRule(rule.id, input) : await createCommissionRule(input);
      if (res.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-[#2c2c2e] dark:bg-[#232325]">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Termin stattgefunden – Sales"
            className={inputCls}
          />
        </Field>
        <Field label="Trigger-Status">
          <select value={statusId} onChange={(e) => setStatusId(e.target.value)} className={inputCls}>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Betrag (€)">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="40.00"
            className={inputCls}
          />
        </Field>
        <Field label="Geltungsbereich">
          <select value={scope} onChange={(e) => setScope(e.target.value as CommissionScope)} className={inputCls}>
            <option value="all">Alle Mitarbeiter</option>
            <option value="role">Bestimmte Rolle</option>
            <option value="user">Bestimmter Mitarbeiter</option>
          </select>
        </Field>
        {scope === "role" && (
          <Field label="Rolle">
            <select value={scopeRole} onChange={(e) => setScopeRole(e.target.value as UserRole)} className={inputCls}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
        )}
        {scope === "user" && (
          <Field label="Mitarbeiter">
            <select value={scopeUserId} onChange={(e) => setScopeUserId(e.target.value)} className={inputCls}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Aktiv
      </label>
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
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </div>
  );
}

const inputCls =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#1c1c1e]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}
