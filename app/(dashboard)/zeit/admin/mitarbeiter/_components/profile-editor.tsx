"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { updateZeitProfile, type UpdateZeitProfileInput } from "../actions";
import { useToastContext } from "../../../../toast-provider";
import type { UserRole, BreakMode } from "@/lib/types";

interface Row {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  hours_mon: number;
  hours_tue: number;
  hours_wed: number;
  hours_thu: number;
  hours_fri: number;
  hours_sat: number;
  hours_sun: number;
  vacation_days_per_year: number;
  break_mode: BreakMode;
}

const ROLES: UserRole[] = ["admin", "sales", "viewer", "employee"];
const DAYS: Array<keyof Row> = ["hours_mon", "hours_tue", "hours_wed", "hours_thu", "hours_fri", "hours_sat", "hours_sun"];

export function ProfileEditorRow({ row }: { row: Row }) {
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(row);

  const dirty = JSON.stringify(draft) !== JSON.stringify(row);

  function save() {
    startTransition(async () => {
      const patch: UpdateZeitProfileInput = {};
      if (draft.name !== row.name) patch.name = draft.name;
      if (draft.role !== row.role) patch.role = draft.role;
      for (const k of DAYS) {
        if (draft[k] !== row[k]) (patch as Record<string, unknown>)[k] = Number(draft[k]);
      }
      if (draft.vacation_days_per_year !== row.vacation_days_per_year) patch.vacation_days_per_year = Number(draft.vacation_days_per_year);
      if (draft.break_mode !== row.break_mode) patch.break_mode = draft.break_mode;
      const res = await updateZeitProfile(row.id, patch);
      if ("error" in res) addToast(res.error, "error");
      else addToast("Profil aktualisiert.", "success");
    });
  }

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-[#2c2c2e]/40 dark:hover:bg-white/[0.02]">
      <td className="px-3 py-2">
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]" />
        <p className="mt-0.5 text-[10px] text-gray-400">{row.email}</p>
      </td>
      <td className="px-3 py-2">
        <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as UserRole })} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </td>
      {DAYS.map((k) => (
        <td key={k} className="px-1 py-2">
          <input
            type="number" min={0} max={24} step={0.25}
            value={draft[k] as number}
            onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
            className="w-14 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-center text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
          />
        </td>
      ))}
      <td className="px-3 py-2">
        <input
          type="number" min={0} max={365} step={0.5}
          value={draft.vacation_days_per_year}
          onChange={(e) => setDraft({ ...draft, vacation_days_per_year: Number(e.target.value) })}
          className="w-16 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-center text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
        />
      </td>
      <td className="px-3 py-2">
        <select value={draft.break_mode} onChange={(e) => setDraft({ ...draft, break_mode: e.target.value as BreakMode })} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]">
          <option value="manual">Manuell</option>
          <option value="auto_deduct">Auto-Abzug</option>
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        <button onClick={save} disabled={!dirty || pending} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-primary-dark disabled:opacity-40">
          <Check className="h-3.5 w-3.5" /> Speichern
        </button>
      </td>
    </tr>
  );
}
