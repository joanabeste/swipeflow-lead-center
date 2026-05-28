"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updateCreditorSettings } from "../actions";
import { Button } from "@/components/ui/button";
import { Section, Field, inputCls } from "./contract-terms-fields";

export function CreditorSettingsForm({
  initial,
}: {
  initial: { id: string; name: string; address: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [id, setId] = useState(initial.id);
  const [address, setAddress] = useState(initial.address);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);
    const res = await updateCreditorSettings({ id, name, address });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Section title="SEPA-Gläubiger (eigene Bankdaten)">
        <p className="-mt-2 text-xs text-gray-400">
          Diese Daten erscheinen im SEPA-Lastschriftmandat der Verträge. Leere Felder fallen auf
          die konfigurierten Standardwerte zurück.
        </p>
        <Field label="Gläubiger-Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Gläubiger-Identifikationsnummer">
          <input value={id} onChange={(e) => setId(e.target.value)} className={inputCls} placeholder="DE00ZZZ00000000000" />
        </Field>
        <Field label="Anschrift">
          <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} placeholder="Straße Nr., PLZ Ort" />
        </Field>
      </Section>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> Gespeichert
          </span>
        )}
        <Button onClick={save} busy={busy} size="md">
          Speichern
        </Button>
      </div>
    </div>
  );
}
