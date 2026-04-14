"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Loader2 } from "lucide-react";
import type { CustomLeadStatus } from "@/lib/types";
import { createManualLead } from "./actions";
import { useToastContext } from "../toast-provider";

export function NewLeadModal({
  statuses,
  onClose,
}: {
  statuses: CustomLeadStatus[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [crmStatusId, setCrmStatusId] = useState<string>(
    statuses.find((s) => s.id === "todo")?.id ?? statuses[0]?.id ?? "",
  );
  const [openDetail, setOpenDetail] = useState(false);

  const activeStatuses = statuses.filter((s) => s.is_active);

  function submit() {
    if (!companyName.trim()) {
      setError("Firmenname fehlt.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createManualLead({
        companyName,
        domain: domain || null,
        website: website || null,
        phone: phone || null,
        email: email || null,
        street: street || null,
        zip: zip || null,
        city: city || null,
        industry: industry || null,
        companySize: companySize || null,
        crmStatusId: crmStatusId || null,
      });
      if (res.error) {
        setError(res.error);
        addToast(res.error, "error");
      } else if (res.success && res.leadId) {
        addToast("Lead angelegt", "success");
        if (openDetail) {
          router.push(`/crm/${res.leadId}`);
        } else {
          onClose();
          router.refresh();
        }
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <h2 className="text-lg font-semibold">Neuer Lead</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Pflicht */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              Firmenname <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="z.B. Acme GmbH"
              className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
            />
          </div>

          {/* Kontakt */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telefon" value={phone} onChange={setPhone} placeholder="+49 …" />
            <Field label="E-Mail" value={email} onChange={setEmail} placeholder="info@firma.de" type="email" />
            <Field label="Website" value={website} onChange={setWebsite} placeholder="firma.de" />
            <Field label="Domain" value={domain} onChange={setDomain} placeholder="firma.de" />
          </div>

          {/* Adresse */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Straße" value={street} onChange={setStreet} />
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <Field label="PLZ" value={zip} onChange={setZip} />
              <Field label="Ort" value={city} onChange={setCity} />
            </div>
          </div>

          {/* Branche + Größe */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Branche" value={industry} onChange={setIndustry} />
            <Field label="Unternehmensgröße" value={companySize} onChange={setCompanySize} placeholder="z.B. 50" />
          </div>

          {/* CRM-Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">CRM-Status</label>
            <select
              value={crmStatusId}
              onChange={(e) => setCrmStatusId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
            >
              <option value="">— ohne Status —</option>
              {activeStatuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={openDetail}
              onChange={(e) => setOpenDetail(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Nach dem Anlegen direkt öffnen
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
          >
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={pending || !companyName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {pending ? "Anlegen…" : "Lead anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-gray-200 bg-white p-2 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
      />
    </label>
  );
}
