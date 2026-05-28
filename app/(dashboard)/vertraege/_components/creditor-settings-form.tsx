"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updateCreditorSettings, updateProviderSignature } from "../actions";
import { Button } from "@/components/ui/button";
import { Section, Field, inputCls } from "./contract-terms-fields";

export function CreditorSettingsForm({
  initial,
  signatureUrl,
}: {
  initial: { id: string; name: string; address: string };
  signatureUrl: string | null;
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

  const [sigBusy, setSigBusy] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);
  const [sigSaved, setSigSaved] = useState(false);

  async function onSignatureFile(file: File) {
    setSigError(null);
    setSigSaved(false);
    if (file.type !== "image/png") {
      setSigError("Bitte eine PNG-Datei wählen.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setSigBusy(true);
    const res = await updateProviderSignature({ dataUrl });
    setSigBusy(false);
    if ("error" in res) {
      setSigError(res.error);
      return;
    }
    setSigSaved(true);
    setTimeout(() => setSigSaved(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Section title="swipeflow-Unterschrift">
        <p className="-mt-2 text-xs text-gray-400">
          Diese Unterschrift erscheint im Dienstleister-Feld jedes Vertrags-PDF. Bereits unterschriebene
          Verträge werden beim nächsten Download neu erzeugt. Nur PNG, idealerweise mit transparentem Hintergrund.
        </p>
        {signatureUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={signatureUrl}
            alt="Hinterlegte swipeflow-Unterschrift"
            className="h-20 w-auto rounded-lg border border-gray-200 bg-white p-2 dark:border-[#2c2c2e]"
          />
        ) : (
          <p className="text-xs text-gray-400">Noch keine Unterschrift hinterlegt.</p>
        )}
        <Field label="Unterschrift (PNG) hochladen">
          <input
            type="file"
            accept="image/png"
            disabled={sigBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onSignatureFile(file);
              e.target.value = "";
            }}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-900 dark:text-gray-300"
          />
        </Field>
        {sigError && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">{sigError}</p>
        )}
        {sigBusy && <p className="text-xs text-gray-400">Wird hochgeladen …</p>}
        {sigSaved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> Unterschrift gespeichert
          </span>
        )}
      </Section>

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
