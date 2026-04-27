"use client";

import { Database, Info } from "lucide-react";
import { SmartImport } from "./smart-import";
import type { MappingTemplate } from "@/lib/types";

interface Props {
  templates: MappingTemplate[];
}

export function NorthDataImport({ templates }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-4">
        <Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium">NorthData-Export importieren</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Lade hier deinen CSV-Export von northdata.de hoch. Erkannte Spalten u.a.:
            Firmenname, Adresse, HRB/HRA, Geschäftsführer, Mitarbeiter, Umsatz,
            Unternehmensgegenstand, Status, Gründungsdatum.
          </p>
          <p className="flex items-center gap-1.5 pt-1 text-xs text-gray-500 dark:text-gray-500">
            <Info className="h-3 w-3" />
            Mehrere Zusatzfelder (Umsatz, Geschäftsführer, Status …) werden in der
            Beschreibung zusammengeführt.
          </p>
        </div>
      </div>

      <SmartImport templates={templates} forcedFormat="northdata" />
    </div>
  );
}
