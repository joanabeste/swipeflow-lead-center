import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadContract } from "@/lib/contracts/data";
import { buildRenderInput } from "@/lib/contracts/render";
import { renderContractHtml } from "@/lib/contracts/template";

export default async function VertragVorschauPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadContract(id);
  if (!loaded) notFound();
  const { contract, lead } = loaded;

  const html = renderContractHtml(buildRenderInput(contract, lead, { mode: "view" }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={`/vertraege/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
        <ArrowLeft className="h-4 w-4" /> Zurück zum Vertrag
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Vorschau</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          So sieht der Kunde den Vertrag (ohne ausgefüllte Felder/Unterschrift).
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-[#2c2c2e]/50">
        <iframe title="Vertrags-Vorschau" srcDoc={html} className="h-[80vh] w-full bg-white" />
      </div>
    </div>
  );
}
