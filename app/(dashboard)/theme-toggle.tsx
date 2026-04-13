"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
    >
      {theme === "dark" ? (
        <>
          <Sun className="h-4 w-4" />
          Helles Design
        </>
      ) : (
        <>
          <Moon className="h-4 w-4" />
          Dunkles Design
        </>
      )}
    </button>
  );
}
