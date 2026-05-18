"use client";

import { useState, useRef, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, AtSign, Calendar } from "lucide-react";
import { addStandaloneTodo } from "../actions";
import { parseQuickAddInput, todayKey } from "../_lib/date-utils";
import { useToastContext } from "../../toast-provider";

interface LeadCatalogEntry {
  id: string;
  company_name: string;
  city: string | null;
}

interface Props {
  leadCatalog: LeadCatalogEntry[];
}

export function TodoQuickAdd({ leadCatalog }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pickedLead, setPickedLead] = useState<LeadCatalogEntry | null>(null);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [pending, startTransition] = useTransition();

  // Derived: Titel + Datum aus dem aktuellen Text live previewen
  const parsed = useMemo(() => parseQuickAddInput(text || ""), [text]);

  // @-Mention: wenn der User „@" tippt, öffnen wir die Lead-Suche
  const mentionMatch = text.match(/@([^\s]*)$/);
  const mentionQuery = mentionMatch?.[1].toLowerCase() ?? "";
  const filteredLeads = useMemo(() => {
    if (!mentionMatch) return [];
    const q = mentionQuery;
    return leadCatalog
      .filter((l) => !q || l.company_name.toLowerCase().includes(q) || (l.city ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [leadCatalog, mentionMatch, mentionQuery]);

  // Globaler Shortcut: „n" fokussiert das Quick-Add-Input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function pickLead(lead: LeadCatalogEntry) {
    setPickedLead(lead);
    // Mention aus dem Text entfernen
    if (mentionMatch) {
      setText(text.slice(0, mentionMatch.index ?? 0).trim());
    }
    setShowLeadPicker(false);
    inputRef.current?.focus();
  }

  function submit() {
    const cleanText = text.replace(/@[^\s]*/g, "").trim();
    if (!cleanText) return;
    if (!pickedLead) {
      addToast("Bitte einen Lead via @-Erwähnung wählen.", "error");
      return;
    }
    const { title, date } = parseQuickAddInput(cleanText);
    if (!title.trim()) return;

    startTransition(async () => {
      const res = await addStandaloneTodo(title, date, pickedLead.id);
      if (res.error) {
        addToast(res.error, "error");
        return;
      }
      addToast("ToDo angelegt", "success");
      setText("");
      setPickedLead(null);
      router.refresh();
    });
  }

  const dateLabel =
    parsed.date === todayKey()
      ? "Heute"
      : (() => {
          const [y, m, d] = parsed.date.split("-");
          return `${d}.${m}.${y}`;
        })();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-primary" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setShowLeadPicker(/@[^\s]*$/.test(e.target.value));
          }}
          onFocus={() => {
            if (/@[^\s]*$/.test(text)) setShowLeadPicker(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !showLeadPicker) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              setShowLeadPicker(false);
              inputRef.current?.blur();
            }
          }}
          placeholder='Was steht an? z.B. "Anrufen morgen @acme" — n drücken zum Fokussieren'
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
          disabled={pending}
        />
        {pickedLead ? (
          <button
            onClick={() => setPickedLead(null)}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
            title="Lead entfernen"
          >
            <AtSign className="h-3 w-3" />
            {pickedLead.company_name.length > 28
              ? pickedLead.company_name.slice(0, 26) + "…"
              : pickedLead.company_name}
            <span className="text-primary/60">×</span>
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">@-Lead wählen</span>
        )}
        {text && (
          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600 dark:bg-white/5 dark:text-gray-400">
            <Calendar className="h-2.5 w-2.5" />
            {dateLabel}
          </span>
        )}
        <button
          onClick={submit}
          disabled={pending || !text.trim() || !pickedLead}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Anlegen"}
        </button>
      </div>

      {showLeadPicker && filteredLeads.length > 0 && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-sm dark:border-[#2c2c2e] dark:bg-[#161618]">
          {filteredLeads.map((l) => (
            <button
              key={l.id}
              onClick={() => pickLead(l)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary/5"
            >
              <span className="font-medium">{l.company_name}</span>
              {l.city && <span className="text-xs text-gray-400">{l.city}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
