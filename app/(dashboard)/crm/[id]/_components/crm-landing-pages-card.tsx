"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Megaphone, Plus, Pencil, Trash2, Eye, Link2, X, Save } from "lucide-react";
import type { LeadContact } from "@/lib/types";
import type { CaseStudy, Industry, LandingPage } from "@/lib/landing-pages/types";
import { buildDefaultSnapshot, toLoomEmbedUrl } from "@/lib/landing-pages/generator";
import { useToastContext } from "../../../toast-provider";
import { Card } from "./crm-shared";
import {
  createLandingPageAction,
  deleteLandingPageAction,
  updateLandingPageAction,
} from "../landing-page-actions";

interface Props {
  leadId: string;
  companyName: string;
  senderName: string | null;
  contacts: LeadContact[];
  industries: Industry[];
  caseStudies: CaseStudy[];
  landingPages: LandingPage[];
}

export function CrmLandingPagesCard({
  leadId,
  companyName,
  senderName,
  contacts,
  industries,
  caseStudies,
  landingPages,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const { addToast } = useToastContext();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function buildPublicUrl(slug: string): string {
    const domain = process.env.NEXT_PUBLIC_LANDING_DOMAIN;
    if (typeof window === "undefined") {
      return domain ? `https://${domain}/${slug}` : `/lp/${slug}`;
    }
    if (domain) return `https://${domain}/${slug}`;
    return `${window.location.origin}/lp/${slug}`;
  }

  async function copyLink(slug: string) {
    const url = buildPublicUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      addToast("Link kopiert.", "success");
    } catch {
      addToast(url, "info");
    }
  }

  function handleDelete(id: string) {
    if (!confirm("Landing-Page löschen? Der Link zeigt danach 404.")) return;
    startTransition(async () => {
      const res = await deleteLandingPageAction({ id, leadId });
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Landing-Page gelöscht.", "success");
        router.refresh();
      }
    });
  }

  const dialog = dialogState;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Megaphone className="h-3.5 w-3.5" />
          Landing-Pages ({landingPages.length})
        </h2>
        <button
          type="button"
          onClick={() => setDialogState({ mode: "create" })}
          disabled={industries.length === 0}
          title={industries.length === 0 ? "Zuerst unter Einstellungen → Landing Pages eine Branche anlegen." : "Neue Landing-Page erzeugen"}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-gray-200"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {landingPages.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">
          {industries.length === 0
            ? "Noch keine Branchen — in den Einstellungen konfigurieren."
            : "Noch keine Landing-Page für diesen Lead."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {landingPages.map((lp) => {
            const contact = contacts.find((c) => c.id === lp.contact_id) ?? null;
            const industry = industries.find((i) => i.id === lp.industry_id) ?? null;
            return (
              <li
                key={lp.id}
                className="rounded-md border border-gray-100 p-2.5 dark:border-[#2c2c2e]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{lp.headline || lp.greeting}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {contact?.name ?? "Ohne Kontakt"} · {industry?.label ?? "—"} ·{" "}
                      {new Date(lp.created_at).toLocaleDateString("de-DE")}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Eye className="h-3 w-3" />
                      {lp.view_count} Aufrufe
                      {lp.last_viewed_at && (
                        <span>
                          {" "}· zuletzt{" "}
                          {new Date(lp.last_viewed_at).toLocaleDateString("de-DE")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => copyLink(lp.slug)}
                      title="Link kopieren"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDialogState({ mode: "edit", page: lp })}
                      title="Bearbeiten"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(lp.id)}
                      disabled={pending}
                      title="Löschen"
                      className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <LandingPageDialog
          leadId={leadId}
          companyName={companyName}
          senderName={senderName}
          contacts={contacts}
          industries={industries}
          caseStudies={caseStudies}
          state={dialog}
          onClose={() => setDialogState(null)}
          onCreated={(slug) => {
            setDialogState(null);
            void copyLink(slug);
            router.refresh();
          }}
          onUpdated={() => {
            setDialogState(null);
            addToast("Landing-Page gespeichert.", "success");
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

type DialogState = { mode: "create" } | { mode: "edit"; page: LandingPage };

function LandingPageDialog({
  leadId,
  companyName,
  senderName,
  contacts,
  industries,
  caseStudies,
  state,
  onClose,
  onCreated,
  onUpdated,
}: {
  leadId: string;
  companyName: string;
  senderName: string | null;
  contacts: LeadContact[];
  industries: Industry[];
  caseStudies: CaseStudy[];
  state: DialogState;
  onClose: () => void;
  onCreated: (slug: string) => void;
  onUpdated: () => void;
}) {
  const existing = state.mode === "edit" ? state.page : null;

  const [contactId, setContactId] = useState<string | "">(
    existing?.contact_id ?? contacts[0]?.id ?? "",
  );
  const [industryId, setIndustryId] = useState<string>(
    existing?.industry_id ?? industries[0]?.id ?? "",
  );
  const [greeting, setGreeting] = useState(existing?.greeting ?? "");
  const [headline, setHeadline] = useState(existing?.headline ?? "");
  const [introText, setIntroText] = useState(existing?.intro_text ?? "");
  const [outroText, setOutroText] = useState(existing?.outro_text ?? "");
  const [loomUrl, setLoomUrl] = useState(existing?.loom_url ?? "");
  const [caseStudyIds, setCaseStudyIds] = useState<string[]>(
    existing?.case_study_ids ?? [],
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Mount-Guard: createPortal braucht `document`, das auf dem Server nicht
  // existiert. Erst nach dem ersten Client-Render rendern wir das Modal.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const selectedIndustry = industries.find((i) => i.id === industryId) ?? null;
  const selectedContact = contacts.find((c) => c.id === contactId) ?? null;

  const availableStudies = useMemo(
    () =>
      caseStudies.filter(
        (cs) => cs.is_active && (cs.industry_id === industryId || cs.industry_id === null),
      ),
    [caseStudies, industryId],
  );

  function applyDefaults() {
    if (!selectedIndustry) return;
    const draft = buildDefaultSnapshot({
      industry: selectedIndustry,
      contact: selectedContact
        ? {
            name: selectedContact.name,
            role: selectedContact.role,
            salutation: selectedContact.salutation,
          }
        : null,
      companyName,
      senderName,
      caseStudies,
    });
    setGreeting(draft.greeting);
    setHeadline(draft.headline);
    setIntroText(draft.intro_text);
    setOutroText(draft.outro_text ?? "");
    setLoomUrl(draft.loom_url ?? "");
    setCaseStudyIds(draft.case_study_ids);
  }

  // Beim ersten Öffnen im Create-Modus die Defaults der Ausgangsbranche
  // einmalig ziehen — im Edit-Modus bleibt der gespeicherte Snapshot.
  const didAutofill = useRef(state.mode === "edit");
  useEffect(() => {
    if (didAutofill.current) return;
    if (!selectedIndustry) return;
    applyDefaults();
    didAutofill.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndustry]);

  function toggleStudy(id: string) {
    setCaseStudyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function moveStudy(id: string, dir: -1 | 1) {
    setCaseStudyIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = [...prev];
      const to = idx + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const basePayload = {
      leadId,
      contactId: contactId || null,
      industryId: industryId || null,
      greeting,
      headline,
      introText,
      loomUrl: loomUrl.trim() || null,
      outroText: outroText.trim() || null,
      caseStudyIds,
    };
    startTransition(async () => {
      if (state.mode === "edit") {
        const res = await updateLandingPageAction({
          ...basePayload,
          id: state.page.id,
        });
        if ("error" in res) setError(res.error);
        else onUpdated();
      } else {
        const res = await createLandingPageAction({
          ...basePayload,
          companyName,
        });
        if ("error" in res) setError(res.error);
        else onCreated(res.slug);
      }
    });
  }

  const embedUrl = toLoomEmbedUrl(loomUrl);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-[#1c1c1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2c2c2e]">
          <h2 className="text-lg font-semibold">
            {state.mode === "edit" ? "Landing-Page bearbeiten" : "Neue Landing-Page"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kontakt">
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              >
                <option value="">— ohne Kontakt —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.salutation === "herr" ? "Hr. " : c.salutation === "frau" ? "Fr. " : ""}
                    {c.name}
                    {c.role ? ` · ${c.role}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Branche">
              <select
                value={industryId}
                onChange={(e) => setIndustryId(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              >
                {industries.map((ind) => (
                  <option key={ind.id} value={ind.id}>{ind.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <button
              type="button"
              onClick={applyDefaults}
              className="text-xs font-medium text-primary hover:underline"
            >
              ↻ Defaults aus Branche &amp; Kontakt neu laden
            </button>
          </div>

          <Field label="Begrüßung">
            <input
              type="text"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
            />
          </Field>

          <Field label="Headline">
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
            />
          </Field>

          <Field label="Intro-Text">
            <textarea
              rows={4}
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
            />
          </Field>

          <Field label="Loom-URL">
            <input
              type="url"
              value={loomUrl}
              onChange={(e) => setLoomUrl(e.target.value)}
              placeholder="https://www.loom.com/share/…"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
            />
            {loomUrl && !embedUrl && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Kein gültiges Loom-Format erkannt — prüfe die URL.
              </p>
            )}
          </Field>

          <Field label="Outro-Text (optional)">
            <textarea
              rows={2}
              value={outroText}
              onChange={(e) => setOutroText(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
            />
          </Field>

          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
              Case-Studies ({caseStudyIds.length} ausgewählt)
            </p>
            {availableStudies.length === 0 ? (
              <p className="text-xs text-gray-400">
                Keine aktiven Case-Studies für diese Branche. Unter Einstellungen → Landing Pages konfigurieren.
              </p>
            ) : (
              <ul className="space-y-1.5 rounded-md border border-gray-100 p-2 dark:border-[#2c2c2e]">
                {availableStudies.map((cs) => {
                  const selected = caseStudyIds.includes(cs.id);
                  const pos = caseStudyIds.indexOf(cs.id);
                  return (
                    <li key={cs.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStudy(cs.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{cs.title}</p>
                        {cs.subtitle && (
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {cs.subtitle}
                          </p>
                        )}
                      </div>
                      {selected && (
                        <div className="flex items-center gap-0.5 text-xs text-gray-500">
                          <button
                            type="button"
                            disabled={pos <= 0}
                            onClick={() => moveStudy(cs.id, -1)}
                            className="rounded px-1 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/5"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={pos >= caseStudyIds.length - 1}
                            onClick={() => moveStudy(cs.id, 1)}
                            className="rounded px-1 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/5"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-[#2c2c2e]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              <Save className="h-3.5 w-3.5" />
              {state.mode === "edit"
                ? pending ? "Speichere…" : "Speichern"
                : pending ? "Erstelle…" : "Erstellen & Link kopieren"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}
