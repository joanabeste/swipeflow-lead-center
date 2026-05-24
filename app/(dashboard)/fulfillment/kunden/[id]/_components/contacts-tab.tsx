"use client";

import { useState, useTransition } from "react";
import { Plus, Star, Trash2, Mail, Phone, Pencil } from "lucide-react";
import type { CustomerContact, Salutation } from "@/lib/fulfillment/types";
import { createContact, deleteContact, updateContact } from "../../../actions";
import { useToastContext } from "../../../../toast-provider";

type Draft = {
  first_name: string;
  last_name: string;
  salutation: Salutation;
  role: string;
  email: string;
  phone: string;
  is_primary: boolean;
  notes: string;
};

const emptyDraft: Draft = {
  first_name: "",
  last_name: "",
  salutation: "sie",
  role: "",
  email: "",
  phone: "",
  is_primary: false,
  notes: "",
};

export function ContactsTab({ leadId, contacts }: { leadId: string; contacts: CustomerContact[] }) {
  const { addToast } = useToastContext();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.first_name.trim()) {
      addToast("Vorname erforderlich.", "error");
      return;
    }
    startTransition(async () => {
      const res = await createContact({ lead_id: leadId, ...draft });
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Kontakt angelegt.", "success");
        setDraft(emptyDraft);
        setShowAdd(false);
      }
    });
  }

  function handleSave(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!draft.first_name.trim()) {
      addToast("Vorname erforderlich.", "error");
      return;
    }
    startTransition(async () => {
      const res = await updateContact(id, {
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim() || null,
        salutation: draft.salutation,
        role: draft.role.trim() || null,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        notes: draft.notes.trim() || null,
      });
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Kontakt gespeichert.", "success");
        setEditingId(null);
      }
    });
  }

  function startEdit(c: CustomerContact) {
    setDraft({
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      salutation: c.salutation,
      role: c.role ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      is_primary: c.is_primary,
      notes: c.notes ?? "",
    });
    setEditingId(c.id);
    setShowAdd(false);
  }

  function togglePrimary(c: CustomerContact) {
    startTransition(async () => {
      const res = await updateContact(c.id, { is_primary: !c.is_primary });
      if ("error" in res) addToast(res.error, "error");
    });
  }

  function remove(id: string) {
    if (!confirm("Kontakt wirklich loeschen?")) return;
    startTransition(async () => {
      const res = await deleteContact(id);
      if ("error" in res) addToast(res.error, "error");
      else addToast("Kontakt geloescht.", "success");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {contacts.length} Ansprechpartner
        </h2>
        <button
          type="button"
          onClick={() => {
            setShowAdd((v) => !v);
            setEditingId(null);
            setDraft(emptyDraft);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark"
        >
          <Plus className="h-3.5 w-3.5" /> Neuer Kontakt
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <ContactFields draft={draft} setDraft={setDraft} showPrimaryToggle />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">Abbrechen</button>
            <button type="submit" disabled={pending} className="rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50">{pending ? "Speichern…" : "Anlegen"}</button>
          </div>
        </form>
      )}

      {contacts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-[#2c2c2e]/60">
          Noch keine Ansprechpartner. Lege den ersten an.
        </p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id} className="rounded-2xl border border-primary/40 bg-white p-4 dark:bg-[#161618]">
                <form onSubmit={(e) => handleSave(e, c.id)}>
                  <ContactFields draft={draft} setDraft={setDraft} />
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-[#2c2c2e]/60 dark:hover:bg-white/5">Abbrechen</button>
                    <button type="submit" disabled={pending} className="rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-primary-dark disabled:opacity-50">{pending ? "Speichern…" : "Speichern"}</button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={c.id} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
                <button
                  type="button"
                  onClick={() => togglePrimary(c)}
                  title={c.is_primary ? "Primaerer Kontakt" : "Als primaer markieren"}
                  className={`mt-0.5 rounded-md p-1 ${c.is_primary ? "text-amber-500" : "text-gray-300 hover:text-gray-500"}`}
                >
                  <Star className="h-4 w-4" fill={c.is_primary ? "currentColor" : "none"} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 dark:text-white">{c.name || "—"}</p>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${c.salutation === "du" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"}`}>
                      {c.salutation === "du" ? "Du" : "Sie"}
                    </span>
                    {c.role && <span className="text-xs text-gray-500">{c.role}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-primary"><Mail className="h-3 w-3" />{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="h-3 w-3" />{c.phone}</a>}
                  </div>
                  {c.notes && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{c.notes}</p>}
                </div>
                <button type="button" onClick={() => startEdit(c)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(c.id)} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e] dark:text-gray-100";

function ContactFields({ draft, setDraft, showPrimaryToggle = false }: { draft: Draft; setDraft: (d: Draft) => void; showPrimaryToggle?: boolean }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vorname *"><input value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} className={inputCls} required /></Field>
        <Field label="Nachname"><input value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} className={inputCls} /></Field>
        <Field label="Anrede">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]">
            {(["du", "sie"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setDraft({ ...draft, salutation: opt })}
                className={`rounded-lg px-3 py-1 text-sm font-medium transition ${draft.salutation === opt ? "bg-primary text-gray-900 shadow-sm" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"}`}
              >
                {opt === "du" ? "Du" : "Sie"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Rolle"><input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="z.B. Geschaeftsfuehrer" className={inputCls} /></Field>
        <Field label="E-Mail"><input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className={inputCls} /></Field>
        <Field label="Telefon"><input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className={inputCls} /></Field>
        <Field label="Notiz" full><textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputCls} /></Field>
      </div>
      {showPrimaryToggle && (
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.is_primary} onChange={(e) => setDraft({ ...draft, is_primary: e.target.checked })} className="h-4 w-4 accent-primary" />
          <span className="text-gray-600 dark:text-gray-300">Als primaeren Ansprechpartner setzen</span>
        </label>
      )}
    </>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
