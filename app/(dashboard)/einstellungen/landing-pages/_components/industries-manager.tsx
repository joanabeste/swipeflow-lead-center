"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronRight, FileText } from "lucide-react";
import type { Industry } from "@/lib/landing-pages/types";
import { useToastContext } from "../../../toast-provider";
import { saveIndustryAction, deleteIndustryAction } from "../actions";

export function IndustriesManager({ industries }: { industries: Industry[] }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  async function save(input: Parameters<typeof saveIndustryAction>[0]) {
    startTransition(async () => {
      const res = await saveIndustryAction(input);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Branche gespeichert.", "success");
        setEditing(null);
        setAdding(false);
        router.refresh();
      }
    });
  }

  function handleDelete(id: string, label: string) {
    if (!confirm(`Branche „${label}" löschen?`)) return;
    startTransition(async () => {
      const res = await deleteIndustryAction(id);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Branche gelöscht.", "success");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Branchen</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-3.5 w-3.5" />
          Neue Branche
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
              <th className="px-4 py-2.5 w-8"></th>
              <th className="px-4 py-2.5">ID</th>
              <th className="px-4 py-2.5">Label</th>
              <th className="px-4 py-2.5 w-24">Order</th>
              <th className="px-4 py-2.5 w-24">Aktiv</th>
              <th className="px-4 py-2.5 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <IndustryEditRow
                onSave={save}
                onCancel={() => setAdding(false)}
                pending={pending}
              />
            )}
            {industries.length === 0 && !adding && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">
                  Noch keine Branchen.
                </td>
              </tr>
            )}
            {industries.map((ind) =>
              editing === ind.id ? (
                <IndustryEditRow
                  key={ind.id}
                  initial={ind}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                  pending={pending}
                />
              ) : (
                <IndustryRow
                  key={ind.id}
                  industry={ind}
                  expanded={expanded === ind.id}
                  onToggleExpand={() => setExpanded(expanded === ind.id ? null : ind.id)}
                  onEdit={() => setEditing(ind.id)}
                  onDelete={() => handleDelete(ind.id, ind.label)}
                  onSaveTemplates={(patch) =>
                    save({
                      id: ind.id,
                      label: ind.label,
                      displayOrder: ind.display_order,
                      isActive: ind.is_active,
                      ...patch,
                    })
                  }
                  pending={pending}
                />
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IndustryRow({
  industry: ind,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onSaveTemplates,
  pending,
}: {
  industry: Industry;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSaveTemplates: (patch: {
    greetingTemplate: string;
    headlineTemplate: string;
    introTemplate: string;
    outroTemplate: string | null;
    loomUrl: string | null;
    calendlyUrl: string | null;
  }) => void;
  pending: boolean;
}) {
  return (
    <>
      <tr className="border-b border-gray-100 last:border-b-0 dark:border-[#2c2c2e]">
        <td className="px-4 py-2 align-middle">
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
            title="Vorlagen anzeigen"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">{ind.id}</td>
        <td className="px-4 py-2 font-medium">{ind.label}</td>
        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{ind.display_order}</td>
        <td className="px-4 py-2 text-xs">
          {ind.is_active ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">aktiv</span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500 dark:bg-white/5 dark:text-gray-400">inaktiv</span>
          )}
        </td>
        <td className="px-4 py-2">
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
              title="Grunddaten bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              title="Branche löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50/50 last:border-b-0 dark:border-[#2c2c2e] dark:bg-white/[0.02]">
          <td colSpan={6} className="px-6 py-4">
            <TemplateEditor
              industry={ind}
              onSave={onSaveTemplates}
              pending={pending}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function IndustryEditRow({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial?: Industry;
  onSave: (input: Parameters<typeof saveIndustryAction>[0]) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [id, setId] = useState(initial?.id ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [order, setOrder] = useState(initial?.display_order ?? 0);
  const [active, setActive] = useState(initial?.is_active ?? true);

  return (
    <tr className="border-b border-gray-100 bg-amber-50/30 last:border-b-0 dark:border-[#2c2c2e] dark:bg-amber-900/10">
      <td className="px-4 py-2" />
      <td className="px-4 py-2">
        <input
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          disabled={!!initial}
          placeholder="recruiting"
          className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs dark:border-[#2c2c2e] dark:bg-[#232325] disabled:opacity-60"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Recruiting"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(Number(e.target.value) || 0)}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
        />
      </td>
      <td className="px-4 py-2">
        <label className="inline-flex items-center gap-1 text-xs">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          aktiv
        </label>
      </td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => onSave({ id, label, displayOrder: order, isActive: active })}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-medium text-gray-900 hover:bg-primary-dark disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            Speichern
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TemplateEditor({
  industry,
  onSave,
  pending,
}: {
  industry: Industry;
  onSave: (patch: {
    greetingTemplate: string;
    headlineTemplate: string;
    introTemplate: string;
    outroTemplate: string | null;
    loomUrl: string | null;
    calendlyUrl: string | null;
  }) => void;
  pending: boolean;
}) {
  const [greeting, setGreeting] = useState(industry.greeting_template);
  const [headline, setHeadline] = useState(industry.headline_template);
  const [intro, setIntro] = useState(industry.intro_template);
  const [outro, setOutro] = useState(industry.outro_template ?? "");
  const [loom, setLoom] = useState(industry.loom_url ?? "");
  const [calendly, setCalendly] = useState(industry.calendly_url ?? "");

  const dirty =
    greeting !== industry.greeting_template ||
    headline !== industry.headline_template ||
    intro !== industry.intro_template ||
    outro !== (industry.outro_template ?? "") ||
    loom !== (industry.loom_url ?? "") ||
    calendly !== (industry.calendly_url ?? "");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <FileText className="h-3.5 w-3.5" />
        <span>
          Platzhalter:{" "}
          <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] dark:bg-white/10">{"{{anrede}}"}</code>{" "}
          <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] dark:bg-white/10">{"{{contact_name}}"}</code>{" "}
          <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] dark:bg-white/10">{"{{contact_first_name}}"}</code>{" "}
          <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] dark:bg-white/10">{"{{company_name}}"}</code>{" "}
          <code className="rounded bg-gray-200 px-1 py-0.5 font-mono text-[10px] dark:bg-white/10">{"{{sender_name}}"}</code>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Begrüßung">
          <input
            type="text"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
          />
        </Field>
        <Field label="Loom-URL (Default)">
          <input
            type="url"
            value={loom}
            onChange={(e) => setLoom(e.target.value)}
            placeholder="https://www.loom.com/share/…"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
          />
        </Field>
        <Field label="Calendly-URL (Default)">
          <input
            type="url"
            value={calendly}
            onChange={(e) => setCalendly(e.target.value)}
            placeholder="https://calendly.com/…"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
          />
        </Field>
      </div>

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
          rows={3}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
        />
      </Field>

      <Field label="Outro-Text (optional)">
        <textarea
          rows={2}
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
        />
      </Field>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            onSave({
              greetingTemplate: greeting,
              headlineTemplate: headline,
              introTemplate: intro,
              outroTemplate: outro.trim() ? outro : null,
              loomUrl: loom.trim() ? loom.trim() : null,
              calendlyUrl: calendly.trim() ? calendly.trim() : null,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Vorlagen speichern
        </button>
      </div>
    </div>
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
