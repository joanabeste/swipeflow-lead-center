"use client";

import { Users } from "lucide-react";
import { SmartImport } from "./smart-import";
import type { MappingTemplate } from "@/lib/types";

interface Props {
  templates: MappingTemplate[];
}

export function RecruitingImport({ templates }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-4">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Recruiting-Import</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Importierte Leads werden mit der Vertikale <strong>Recruiting</strong> markiert.
          </p>
        </div>
      </div>

      <SmartImport templates={templates} vertical="recruiting" />
    </div>
  );
}
