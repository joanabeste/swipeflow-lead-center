"use client";

import { useState, useRef, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, AtSign, CalendarClock, User, Search, X } from "lucide-react";
import { addStandaloneTodo, searchLeadsForTodo } from "../actions";
import { parseQuickAddInput, relativeDueLabel, todayKey } from "../_lib/date-utils";
import { DateTimePopover } from "./date-time-popover";
import { useToastContext } from "../../toast-provider";
import type { TodoPerson } from "../page";

interface LeadCatalogEntry {
  id: string;
  company_name: string;
  city: string | null;
}

interface Props {
  leadCatalog: LeadCatalogEntry[];
  people: TodoPerson[];
  currentUserId: string;
}

export function TodoQuickAdd({ leadCatalog, people, currentUserId }: Props) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const leadSearchRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pickedLead, setPickedLead] = useState<LeadCatalogEntry | null>(null);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Besitzer der neuen ToDo — Default „Ich". Optional einem Kollegen zuweisen.
  const [ownerId, setOwnerId] = useState<string>(currentUserId);
  const [pending, startTransition] = useTransition();

  // Lead-Suche im Panel: serverseitig über die gesamte Lead-DB (nicht nur Top-300).
  const [leadQuery, setLeadQuery] = useState("");
  const [results, setResults] = useState<LeadCatalogEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Steuert, ob beim Öffnen das Panel-Suchfeld fokussiert wird (nur per Button,
  // NICHT beim @-Tippen — sonst springt der Fokus aus dem Titel-Input).
  const focusPanelRef = useRef(false);

  // Datum/Uhrzeit: solange nicht manuell angefasst, folgt es dem geparsten Text.
  const [touched, setTouched] = useState(false);
  const [draftDate, setDraftDate] = useState(todayKey());
  const [draftTime, setDraftTime] = useState<string | null>(null);

  // Text ohne @-Mention → daraus Titel + (Live-)Datum/Uhrzeit parsen
  const cleanText = useMemo(() => text.replace(/@[^\s]*/g, "").trim(), [text]);
  const parsed = useMemo(() => parseQuickAddInput(cleanText), [cleanText]);
  const effDate = touched ? draftDate : parsed.date;
  const effTime = touched ? draftTime : parsed.time;

  // Anzeigeliste: leeres/kurzes Query → Sofort-Vorschläge aus dem Katalog,
  // sonst die serverseitigen Treffer.
  const displayLeads = useMemo(() => {
    if (leadQuery.trim().length < 2) return leadCatalog.slice(0, 8);
    return results;
  }, [leadQuery, leadCatalog, results]);

  // Debounced Server-Suche (200ms) — im Change-Handler statt im Effect, damit die
  // strikte react-hooks/set-state-in-effect-Regel zufrieden ist (Idiom wie global-search).
  function runLeadSearch(value: string) {
    setLeadQuery(value);
    setActiveIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const res = await searchLeadsForTodo(q);
      setResults(res.leads);
      setActiveIndex(0);
      setSearching(false);
    }, 200);
  }

  // Panel via Button geöffnet → Suchfeld fokussieren (Fokus-Ref entscheidet).
  useEffect(() => {
    if (showLeadPicker && focusPanelRef.current) {
      leadSearchRef.current?.focus();
      focusPanelRef.current = false;
    }
  }, [showLeadPicker]);

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
    // Falls per @-Mention geöffnet: die @… aus dem Titeltext entfernen.
    setText((t) => t.replace(/@[^\s]*$/, "").trimEnd());
    closeLeadPicker();
    inputRef.current?.focus();
  }

  function openLeadPicker(seed = "", focus = false) {
    focusPanelRef.current = focus;
    setShowLeadPicker(true);
    runLeadSearch(seed);
  }

  function closeLeadPicker() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowLeadPicker(false);
    setLeadQuery("");
    setResults([]);
    setSearching(false);
    setActiveIndex(0);
  }

  function onLeadSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, displayLeads.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const lead = displayLeads[activeIndex];
      if (lead) pickLead(lead);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeLeadPicker();
      inputRef.current?.focus();
    }
  }

  function reset() {
    setText("");
    setPickedLead(null);
    setTouched(false);
    setDraftTime(null);
    setShowDatePicker(false);
    setOwnerId(currentUserId);
    closeLeadPicker();
  }

  function submit() {
    if (!cleanText) {
      inputRef.current?.focus();
      return;
    }
    if (!pickedLead) {
      addToast("Bitte einen Lead zuordnen.", "error");
      openLeadPicker("", true);
      return;
    }
    const { title } = parseQuickAddInput(cleanText);
    if (!title.trim()) return;

    startTransition(async () => {
      const res = await addStandaloneTodo(title, effDate, pickedLead.id, effTime, ownerId);
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
    <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex flex-wrap items-center gap-2">
        <Plus className="h-4 w-4 shrink-0 text-primary" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            // @-Mention am Textende → Lead-Panel öffnen und Query seeden.
            const m = v.match(/@([^\s]*)$/);
            if (m) openLeadPicker(m[1]);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !showLeadPicker) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder='Was steht an? z.B. "Anrufen morgen 14:30 @acme" — n zum Fokussieren'
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
          disabled={pending}
        />

        {/* Lead-Chip (Pflicht) + Such-Panel */}
        <div className="relative shrink-0">
          {pickedLead ? (
            <button
              onClick={() => setPickedLead(null)}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/20"
              title="Lead entfernen"
            >
              <AtSign className="h-3 w-3" />
              {pickedLead.company_name.length > 24 ? pickedLead.company_name.slice(0, 22) + "…" : pickedLead.company_name}
              <X className="h-3 w-3 text-primary/60" />
            </button>
          ) : (
            <button
              onClick={() => (showLeadPicker ? closeLeadPicker() : openLeadPicker("", true))}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-amber-400 px-2.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/60 dark:text-amber-300 dark:hover:bg-amber-500/10"
              title="Pflicht: Lead zuordnen"
            >
              <AtSign className="h-3 w-3" />
              Lead wählen
            </button>
          )}

          {showLeadPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={closeLeadPicker} />
              <div className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg dark:border-[#2c2c2e] dark:bg-[#161618]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={leadSearchRef}
                    value={leadQuery}
                    onChange={(e) => runLeadSearch(e.target.value)}
                    onKeyDown={onLeadSearchKeyDown}
                    placeholder="Firma oder Stadt suchen…"
                    className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-7 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-[#2c2c2e] dark:bg-[#1c1c1e] dark:text-gray-100 dark:placeholder:text-gray-500"
                  />
                  {searching && (
                    <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-gray-400" />
                  )}
                </div>

                <div className="mt-1.5 max-h-64 overflow-y-auto">
                  {displayLeads.length > 0 ? (
                    displayLeads.map((l, i) => (
                      <button
                        key={l.id}
                        onClick={() => pickLead(l)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
                          i === activeIndex ? "bg-primary/10" : "hover:bg-primary/5"
                        }`}
                      >
                        <span className="truncate font-medium">{l.company_name}</span>
                        {l.city && <span className="shrink-0 text-xs text-gray-400">{l.city}</span>}
                      </button>
                    ))
                  ) : (
                    <p className="px-2.5 py-3 text-center text-xs text-gray-400">
                      {leadQuery.trim().length < 2
                        ? "Mind. 2 Zeichen eingeben"
                        : searching
                          ? "Suche…"
                          : "Keine Treffer"}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Assignee-Chip — ToDo optional einem Kollegen zuweisen (Default „Ich") */}
        {people.length > 1 && (
          <label
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-gray-200 px-2.5 text-xs font-medium text-gray-600 hover:border-primary/40 hover:bg-primary/5 dark:border-[#2c2c2e] dark:text-gray-300"
            title="Für wen ist diese ToDo?"
          >
            <User className="h-3 w-3" />
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="bg-transparent text-xs outline-none dark:[color-scheme:dark]"
              aria-label="ToDo zuweisen"
            >
              <option value={currentUserId}>Ich</option>
              {people
                .filter((p) => p.id !== currentUserId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {/* Datum/Uhrzeit-Chip */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowDatePicker((v) => !v)}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-gray-200 px-2.5 text-xs font-medium text-gray-600 hover:border-primary/40 hover:bg-primary/5 dark:border-[#2c2c2e] dark:text-gray-300"
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
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-40"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Anlegen"}
        </button>
      </div>
    </div>
  );
}
