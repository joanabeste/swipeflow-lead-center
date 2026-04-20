"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { resetDashboardLayout } from "./actions";
import { useToastContext } from "../toast-provider";

export function ResetDashboardButton() {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    if (
      !confirm(
        "Dein aktuelles Dashboard-Layout wird zurückgesetzt — alle Widgets erscheinen wieder in Default-Reihenfolge und -Breite. Fortfahren?",
      )
    )
      return;
    startTransition(async () => {
      const res = await resetDashboardLayout();
      if ("error" in res) {
        addToast(res.error, "error");
      } else {
        addToast("Dashboard zurückgesetzt.", "success");
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#2c2c2e] dark:bg-[#232325] dark:text-gray-200 dark:hover:bg-white/5"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {pending ? "Setze zurück…" : "Dashboard auf Default zurücksetzen"}
    </button>
  );
}
