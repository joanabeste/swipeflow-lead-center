"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteAbsence } from "../actions";
import { useToastContext } from "../../../toast-provider";

export function DeleteAbsenceButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => {
        if (!confirm("Antrag wirklich loeschen?")) return;
        startTransition(async () => {
          const res = await deleteAbsence(id);
          if ("error" in res) addToast(res.error, "error");
          else addToast("Antrag geloescht.", "success");
        });
      }}
      className="rounded-md p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
