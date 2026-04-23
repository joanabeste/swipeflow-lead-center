"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X, ExternalLink } from "lucide-react";
import type { CaseStudy, Industry } from "@/lib/landing-pages/types";
import { useToastContext } from "../../../toast-provider";
import { saveCaseStudyAction, deleteCaseStudyAction } from "../actions";

export function CaseStudiesManager({
  caseStudies,
  industries,
}: {
  caseStudies: CaseStudy[];
  industries: Industry[];
}) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const industryLabel = (id: string | null) =>
    id ? (industries.find((i) => i.id === id)?.label ?? id) : "branchenübergreifend";

  function save(input: Parameters<typeof saveCaseStudyAction>[0]) {
    startTransition(async () => {
      const res = await saveCaseStudyAction(input);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Case-Study gespeichert.", "success");
        setEditing(null);
        setAdding(false);
        router.refresh();
      }
    });
  }

  function handleDelete(id: string, title: string) {
    if (!confirm(`Case-Study „${title}" löschen?`)) return;
    startTransition(async () => {
      const res = await deleteCaseStudyAction(id);
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Case-Study gelöscht.", "success");
        router.refresh();
      }
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Case Studies</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={industries.length === 0}
          title={industries.length === 0 ? "Zuerst mindestens eine Branche anlegen." : undefined}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Neue Case-Study
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-[#2c2c2e] dark:text-gray-400">
              <th className="px-4 py-2.5">Titel</th>
              <th className="px-4 py-2.5">Branche</th>
              <th className="px-4 py-2.5">Link</th>
              <th className="px-4 py-2.5 w-24">Order</th>
              <th className="px-4 py-2.5 w-24">Aktiv</th>
              <th className="px-4 py-2.5 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <CaseStudyEditRow
                industries={industries}
                onSave={save}
                onCancel={() => setAdding(false)}
                pending={pending}
              />
            )}
            {caseStudies.length === 0 && !adding && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">
                  Noch keine Case-Studies.
                </td>
              </tr>
            )}
            {caseStudies.map((cs) =>
              editing === cs.id ? (
                <CaseStudyEditRow
                  key={cs.id}
                  initial={cs}
                  industries={industries}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                  pending={pending}
                />
              ) : (
                <tr key={cs.id} className="border-b border-gray-100 last:border-b-0 dark:border-[#2c2c2e]">
                  <td className="px-4 py-2">
                    <p className="font-medium">{cs.title}</p>
                    {cs.subtitle && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{cs.subtitle}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{industryLabel(cs.industry_id)}</td>
                  <td className="px-4 py-2 text-xs">
                    {cs.link_url ? (
                      <a href={cs.link_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" />
                        Öffnen
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{cs.display_order}</td>
                  <td className="px-4 py-2 text-xs">
                    {cs.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">aktiv</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500 dark:bg-white/5 dark:text-gray-400">inaktiv</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(cs.id)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(cs.id, cs.title)}
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CaseStudyEditRow({
  initial,
  industries,
  onSave,
  onCancel,
  pending,
}: {
  initial?: CaseStudy;
  industries: Industry[];
  onSave: (input: Parameters<typeof saveCaseStudyAction>[0]) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [linkUrl, setLinkUrl] = useState(initial?.link_url ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [industryId, setIndustryId] = useState<string | "">(initial?.industry_id ?? "");
  const [order, setOrder] = useState(initial?.display_order ?? 0);
  const [active, setActive] = useState(initial?.is_active ?? true);

  return (
    <>
      <tr className="border-b border-gray-100 bg-amber-50/30 dark:border-[#2c2c2e] dark:bg-amber-900/10">
        <td colSpan={6} className="px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Titel</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Kundenstory: Handwerk AG"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Branche</span>
              <select
                value={industryId}
                onChange={(e) => setIndustryId(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              >
                <option value="">— branchenübergreifend —</option>
                {industries.map((ind) => (
                  <option key={ind.id} value={ind.id}>{ind.label}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Untertitel</span>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="18 Einstellungen in 6 Monaten"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Beschreibung</span>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Link-URL</span>
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Bild-URL</span>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…/bild.jpg"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Reihenfolge</span>
              <input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value) || 0)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#232325]"
              />
            </label>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                aktiv
              </label>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" />
              Abbrechen
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                onSave({
                  id: initial?.id,
                  industryId: industryId || null,
                  title,
                  subtitle: subtitle.trim() || null,
                  description: description.trim() || null,
                  linkUrl: linkUrl.trim() || null,
                  imageUrl: imageUrl.trim() || null,
                  isActive: active,
                  displayOrder: order,
                })
              }
              className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Speichern
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}
