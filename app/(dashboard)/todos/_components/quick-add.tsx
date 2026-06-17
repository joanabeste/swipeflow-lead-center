"use client";

import { useState, useRef, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, AtSign, CalendarClock } from "lucide-react";
import { addStandaloneTodo } from "../actions";
import { parseQuickAddInput, relativeDueLabel, todayKey } from "../_lib/date-utils";
import { DateTimePopover } from "./date-time-popover";
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pending, startTransition] = useTransition();

  // Datum/Uhrzeit: solange nicht manuell angefasst, folgt es dem geparsten Text.
  const [touched, setTouched] = useState(false);
  const [draftDate, setDraftDate] = useState(todayKey());
  const [draftTime, setDraftTime] = useState<string | null>(null);

  // Text ohne @-Mention → daraus Titel + (Live-)Datum/Uhrzeit parsen
  const cleanText = useMemo(() => text.replace(/@[^\s]*/g, "").trim(), [text]);
  const parsed = useMemo(() => parseQuickAddInput(cleanText), [cleanText]);
  const effDate = touched ? draftDate : parsed.date;
  const effTime = touched ? draftTime : parsed.time;

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
    if (mentionMatch) setText(text.slice(0, mentionMatch.index ?? 0).trim());
    setShowLeadPicker(false);
    inputRef.current?.focus();
  }

  function openLeadPicker() {
    // „@" ans Textende setzen, damit die bestehende Mention-Suche greift
    const base = text.replace(/@[^\s]*$/, "").trimEnd();
    setText(base ? `${base} @` : "@");
    setShowLeadPicker(true);
    inputRef.current?.focus();
  }

  function reset() {
    setText("");
    setPickedLead(null);
    setTouched(false);
    setDraftTime(null);
    setShowDatePicker(false);
  }

  function submit() {
    if (!cleanText) {
      inputRef.current?.focus();
      return;
    }
    if (!pickedLead) {
      addToast("Bitte einen Lead via @-Erwähnung wählen.", "error");
      openLeadPicker();
      return;
    }
    const { title } = parseQuickAddInput(cleanText);
    if (!title.trim()) return;

    startTransition(async () => {
      const res = await addStandaloneTodo(title, effDate, pickedLead.id, effTime);
      if (res.error) {
        addToast(res.error, "error");
        return;
      }
      addToast("ToDo angelegt", "success");
      reset();
      router.refresh();
    });
  }

  const rel = relativeDueLabel(effDate, todayKey());
  const dateChipLabel = effTime ? `${rel.text} · ${effTime}` : rel.text;

  const disabledReason = !cleanText ? "Titel eingeben" : !pickedLead ? "Lead zuordnen (Pflicht)" : "";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-primary" />
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
          placeholder='Was steht an? z.B. "Anrufen morgen 14:30 @acme" — n zum Fokussieren'
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
          disabled={pending}
        />

        {/* Lead-Chip (Pflicht) */}
        {pickedLead ? (
          <button
            onClick={() => setPickedLead(null)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
            title="Lead entfernen"
          >
            <AtSign className="h-3 w-3" />
            {pickedLead.company_name.length > 24 ? pickedLead.company_name.slice(0, 22) + "…" : pickedLead.company_name}
            <span className="text-primary/60">×</span>
          </button>
        ) : (
          <button
            onClick={openLeadPicker}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-amber-400 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/60 dark:text-amber-300 dark:hover:bg-amber-500/10"
            title="Pflicht: Lead zuordnen"
          >
            <AtSign className="h-3 w-3" />
            Lead wählen
          </button>
        )}

        {/* Datum/Uhrzeit-Chip */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowDatePicker((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:border-primary/40 hover:bg-primary/5 dark:border-[#2c2c2e] dark:text-gray-300"
            title="Fälligkeit & Uhrzeit"
          >
            <CalendarClock className="h-3 w-3" />
            {dateChipLabel}
          </button>
          {showDatePicker && (
            <DateTimePopover
              date={effDate}
              time={effTime}
              onChange={(d, t) => {
                setTouched(true);
                setDraftDate(d);
                setDraftTime(t);
              }}
              onClose={() => setShowDatePicker(false)}
            />
          )}
        </div>

        <button
          onClick={submit}
          disabled={pending || !cleanText || !pickedLead}
          title={disabledReason}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-40"
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
