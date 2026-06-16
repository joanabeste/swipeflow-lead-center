import { Suspense } from "react";
import Link from "next/link";
import { LeadTableSection } from "./lead-table-section";
import { LeadTableSkeleton } from "./lead-table-skeleton";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function LeadsPage({ searchParams }: Props) {
  const params = await searchParams;
  const includeCrm = params.include_crm === "1";

  // Toggle-Link baut URL mit gedrehtem include_crm-Param.
  const toggleParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "include_crm" && k !== "page") toggleParams.set(k, v);
  }
  if (!includeCrm) toggleParams.set("include_crm", "1");
  const toggleHref = `/leads${toggleParams.toString() ? `?${toggleParams.toString()}` : ""}`;

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
        <Link
          href={toggleHref}
          className="text-xs font-medium text-primary hover:underline"
        >
          {includeCrm ? "Nur neue Leads zeigen" : "Auch CRM-Leads zeigen"}
        </Link>
      </div>

      <Suspense key={sectionKey} fallback={<LeadTableSkeleton />}>
        <LeadTableSection params={params} />
      </Suspense>
    </div>
  );
}
