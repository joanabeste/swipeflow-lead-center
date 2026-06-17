"use client";

import { useState } from "react";
import { Building2, Check, MapPin, Pencil, X } from "lucide-react";
import type { Lead } from "@/lib/types";
import { updateLead } from "@/app/(dashboard)/leads/actions";
import { useToastContext } from "@/app/(dashboard)/toast-provider";

// Bearbeitbare Felder — Teilmenge der ALLOWED_EDIT_FIELDS von updateLead.
type FieldKey =
  | "company_name"
  | "website"
  | "street"
  | "zip"
  | "city"
  | "state"
  | "country"
  | "industry"
  | "company_size"
  | "legal_form"
  | "register_id"
  | "phone"
  | "email"
  | "description";

const LABELS: Record<FieldKey, string> = {
  company_name: "Firmenname",
  website: "Website",
  street: "Straße",
  zip: "PLZ",
  city: "Ort",
  state: "Bundesland",
  country: "Land",
  industry: "Branche",
  company_size: "Unternehmensgröße",
  legal_form: "Rechtsform",
  register_id: "Handelsregister-Nr.",
  phone: "Telefon",
  email: "E-Mail",
  description: "Beschreibung",
};

const KEYS = Object.keys(LABELS) as FieldKey[];

interface Props {
  leadId: string;
  lead: Lead;
  // Hebt die gespeicherten Felder ins Cockpit-Bundle (das per
  // /api/leads/[id]/preview geladen wird und sich sonst nicht aktualisieren würde).
  onChange: (patch: Partial<Lead>) => void;
}

/**
 * Stammdaten-Karte im Qualifizierungs-Cockpit: lesbare Übersicht + Bearbeiten-
 * Modus. Speichert über die bestehende `updateLead`-Action und spiegelt die
 * Änderung optimistisch ins Bundle (analog zu ContactsCard).
 */
export function StammdatenCard({ leadId, lead, onChange }: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <StammdatenForm
        leadId={leadId}
        lead={lead}
        onChange={onChange}
        onClose={() => setEditing(false)}
      />
    );
  }

  const rows: [string, string | null][] = [
    ["Branche", lead.industry],
    ["Größe", lead.company_size],
    ["Rechtsform", lead.legal_form],
    ["HR-Nr.", lead.register_id],
    ["Telefon", lead.phone],
    ["E-Mail", lead.email],
  ];
  const address = [lead.street, [lead.zip, lead.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" /> Stammdaten
        </h3>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <Pencil className="h-3.5 w-3.5" /> Bearbeiten
        </button>
      </div>
      <dl className="mt-2 space-y-1.5 text-sm">
        {address && (
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="text-gray-700 dark:text-gray-300">{address}</span>
          </div>
        )}
        {rows
          .filter(([, v]) => Boolean(v))
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
              <dd className="truncate text-right text-gray-700 dark:text-gray-300">{v}</dd>
            </div>
          ))}
        {!address && rows.every(([, v]) => !v) && (
          <p className="text-gray-400">Keine Stammdaten hinterlegt.</p>
        )}
      </dl>
    </div>
  );
}

// ─── Bearbeiten-Formular ─────────────────────────────────────────────────

function StammdatenForm({
  leadId,
  lead,
  onChange,
  onClose,
}: {
  leadId: string;
  lead: Lead;
  onChange: (patch: Partial<Lead>) => void;
  onClose: () => void;
}) {
  const { addToast } = useToastContext();
  const [v, setV] = useState<Record<FieldKey, string>>(() => {
    const o = {} as Record<FieldKey, string>;
    for (const k of KEYS) o[k] = ((lead[k] as string | null) ?? "").toString();
    return o;
  });
  const [pending, setPending] = useState(false);

  function set(k: FieldKey, value: string) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!v.company_name.trim()) {
      addToast("Firmenname darf nicht leer sein.", "error");
      return;
    }
    setPending(true);
    const patch: Record<string, string | null> = {};
    for (const k of KEYS) {
      const t = v[k].trim();
      patch[k] = t ? t : null;
    }
    const res = await updateLead(leadId, patch);
    if (res && "error" in res && res.error) {
      addToast(`Fehler: ${res.error}`, "error");
      setPending(false);
      return;
    }
    onChange(patch as Partial<Lead>);
    addToast("Stammdaten gespeichert", "success");
    onClose();
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-200";

  function field(k: FieldKey, opts?: { type?: string }) {
    return (
      <div>
        <label className="mb-0.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
          {LABELS[k]}
        </label>
        <input
          value={v[k]}
          onChange={(e) => set(k, e.target.value)}
          type={opts?.type ?? "text"}
          className={inputCls}
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Building2 className="h-4 w-4 text-primary" /> Stammdaten bearbeiten
      </h3>

      {field("company_name")}
      {field("website")}
      {field("street")}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">{field("zip")}</div>
        <div className="col-span-2">{field("city")}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field("state")}
        {field("country")}
      </div>
      {field("industry")}
      <div className="grid grid-cols-2 gap-2">
        {field("company_size")}
        {field("legal_form")}
      </div>
      {field("register_id")}
      {field("phone")}
      {field("email", { type: "email" })}
      <div>
        <label className="mb-0.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
          {LABELS.description}
        </label>
        <textarea
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
          className={`${inputCls} resize-y`}
        />
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="submit"
          disabled={pending || !v.company_name.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> {pending ? "Speichern…" : "Speichern"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" /> Abbrechen
        </button>
      </div>
    </form>
  );
}
