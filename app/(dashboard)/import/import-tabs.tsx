"use client";

import { useState } from "react";
import { Upload, Globe, List, Database, Palette, Users } from "lucide-react";
import type { MappingTemplate, WebdevScoringConfig } from "@/lib/types";
import { SmartImport } from "./smart-import";
import { NorthDataImport } from "./northdata-import";
import { WebdesignImport } from "./webdesign-import";
import { RecruitingImport } from "./recruiting-import";
import { UrlImport } from "./url-import";
import { DirectoryImport } from "./directory-import";

interface Props {
  templates: MappingTemplate[];
  webdevConfig: WebdevScoringConfig;
}

const tabs = [
  { key: "csv", label: "CSV / Daten", icon: Upload },
  { key: "webdesign", label: "Webdesign", icon: Palette },
  { key: "recruiting", label: "Recruiting", icon: Users },
  { key: "northdata", label: "NorthData", icon: Database },
  { key: "url", label: "Firmen-URL", icon: Globe },
  { key: "directory", label: "Verzeichnis-URL", icon: List },
];

export function ImportTabs({ templates, webdevConfig }: Props) {
  const [activeTab, setActiveTab] = useState("csv");

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-[#2c2c2e]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {activeTab === "csv" && <SmartImport templates={templates} />}
        {activeTab === "webdesign" && <WebdesignImport templates={templates} webdevConfig={webdevConfig} />}
        {activeTab === "recruiting" && <RecruitingImport templates={templates} />}
        {activeTab === "northdata" && <NorthDataImport templates={templates} />}
        {activeTab === "url" && <UrlImport />}
        {activeTab === "directory" && <DirectoryImport />}
      </div>
    </div>
  );
}
