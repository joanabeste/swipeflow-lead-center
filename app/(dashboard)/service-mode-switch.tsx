"use client";

import { Users, Globe } from "lucide-react";
import { useServiceMode } from "@/lib/service-mode";

export function ServiceModeSwitch() {
  const { mode, setMode } = useServiceMode();

  return (
    <div className="flex rounded-xl border border-gray-200 p-0.5 dark:border-[#2c2c2e]">
      <button
        onClick={() => mode !== "recruiting" && setMode("recruiting")}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          mode === "recruiting"
            ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
      >
        <Users className="h-3.5 w-3.5" />
        Recruiting
      </button>
      <button
        onClick={() => mode !== "webdev" && setMode("webdev")}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          mode === "webdev"
            ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
      >
        <Globe className="h-3.5 w-3.5" />
        Webentwicklung
      </button>
    </div>
  );
}
