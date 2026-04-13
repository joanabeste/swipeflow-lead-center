"use client";

import { useState } from "react";
import { FileSpreadsheet, Globe, List } from "lucide-react";
import type { MappingTemplate } from "@/lib/types";
import { ImportWizard } from "./import-wizard";
import { UrlImport } from "./url-import";
import { DirectoryImport } from "./directory-import";

interface Props {
  templates: MappingTemplate[];
}

const tabs = [
  { key: "csv", label: "CSV-Datei", icon: FileSpreadsheet },
  { key: "url", label: "Firmen-URL", icon: Globe },
  { key: "directory", label: "Verzeichnis-URL", icon: List },
];

export function ImportTabs({ templates }: Props) {
  const [activeTab, setActiveTab] = useState("csv");

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
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
        {activeTab === "csv" && <ImportWizard templates={templates} />}
        {activeTab === "url" && <UrlImport />}
        {activeTab === "directory" && <DirectoryImport />}
      </div>
    </div>
  );
}
