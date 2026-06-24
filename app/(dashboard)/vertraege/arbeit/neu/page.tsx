import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewEmploymentForm } from "../_components/new-employment-form";

export default function NeuerArbeitsvertragPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/vertraege/arbeit" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Zurück zu Arbeitsverträgen
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900 dark:text-white">Neuer Arbeitsvertrag</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Vertragsart wählen, Eckdaten anpassen und anschließend den Signier-Link erzeugen.
        </p>
      </div>
      <NewEmploymentForm />
    </div>
  );
}
