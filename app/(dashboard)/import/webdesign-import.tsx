"use client";

import { Palette, Info } from "lucide-react";
import { SmartImport } from "./smart-import";
import type { MappingTemplate, WebdevScoringConfig } from "@/lib/types";

interface Props {
  templates: MappingTemplate[];
  webdevConfig: WebdevScoringConfig;
}

export function WebdesignImport({ templates, webdevConfig }: Props) {
  const allowsNoWebsite = webdevConfig.allow_leads_without_website;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-4">
        <Palette className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Webdesign-Import</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Importierte Leads werden mit der Vertikale <strong>Webdesign</strong> markiert.
          </p>
          <p className="flex items-start gap-1.5 pt-1 text-xs text-gray-500 dark:text-gray-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {allowsNoWebsite ? (
                <>Leads ohne Website werden aktuell <strong>akzeptiert</strong>. Anpassbar in den Einstellungen → Webdesign-Bewertung.</>
              ) : (
                <>Leads ohne Website werden aktuell <strong>aussortiert</strong> (cancelled). Anpassbar in den Einstellungen → Webdesign-Bewertung.</>
              )}
            </span>
          </p>
        </div>
      </div>

      <SmartImport templates={templates} vertical="webdesign" />
    </div>
  );
}
