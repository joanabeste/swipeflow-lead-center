import { findDuplicateClusters } from "./actions";
import { DuplikateManager } from "./duplikate-manager";

export const dynamic = "force-dynamic";

export default async function DuplikatePage() {
  const clusters = await findDuplicateClusters();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Duplikate bereinigen</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
          Doppelt angelegte Firmen werden zusammengeführt. Anrufe, Verträge und Notizen wandern
          auf den behaltenen Lead, das Duplikat wird archiviert (umkehrbar). Prüfe die Auswahl vor
          dem Zusammenführen — automatisch erkannte Gruppen können (z.B. über eine geteilte
          Domain) auch verschiedene Firmen enthalten; solche einfach abwählen.
        </p>
      </div>

      <DuplikateManager clusters={clusters} />
    </div>
  );
}
