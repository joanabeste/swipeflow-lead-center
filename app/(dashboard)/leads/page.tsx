import { Suspense } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { LeadTableSection } from "./lead-table-section";
import { LeadTableSkeleton } from "./lead-table-skeleton";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function LeadsPage({ searchParams }: Props) {
  const params = await searchParams;
  // include_crm bleibt als stiller URL-Override (?include_crm=1) erhalten —
  // der sichtbare Umschalt-Button wurde entfernt.
  const includeCrm = params.include_crm === "1";

  // Suspense-Key: bei Filter-/Seitenwechsel zeigt die Grenze wieder das
  // Skeleton, statt die alte Tabelle bis zum Eintreffen der neuen Daten
  // einzufrieren. NUR datenrelevante Params einrechnen — reine Ansichts-Params
  // wie `preview` (Schnellansicht-Drawer, rein client-seitig) dürfen NICHT zum
  // Key-Wechsel führen, sonst remountet beim Lead-Wechsel im Auge die ganze
  // Tabelle (Skeleton-Flash + unnötige Query).
  const sectionKey = new URLSearchParams(
    Object.entries(params).filter(
      ([k, v]) => v != null && k !== "preview",
    ) as [string, string][],
  ).toString();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {includeCrm ? "Alle Leads" : "Neue Leads"}
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/leads/qualifizieren"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 transition hover:bg-primary-dark"
            title="Webdesign-Leads im Vollbild qualifizieren"
          >
            <Zap className="h-4 w-4" />
            Qualifizieren
          </Link>
        </div>
      </div>

      <Suspense key={sectionKey} fallback={<LeadTableSkeleton />}>
        <LeadTableSection params={params} />
      </Suspense>
    </div>
  );
}
