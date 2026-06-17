"use client";

import { useState } from "react";
import { Check, Mail, Pencil, Phone, Plus, Trash2, User, X } from "lucide-react";
import type { ContactSalutation, LeadContact } from "@/lib/types";
import { addContact, deleteContact, updateContact } from "@/app/(dashboard)/crm/actions";
import { useToastContext } from "@/app/(dashboard)/toast-provider";

interface Props {
  leadId: string;
  contacts: LeadContact[];
  // Hebt die optimistisch geaenderte Kontaktliste ins Cockpit-Bundle (das per
  // /api/leads/[id]/preview geladen wird und sich sonst nicht aktualisieren wuerde).
  onChange: (next: LeadContact[]) => void;
}

interface FormValues {
  name: string;
  role: string;
  email: string;
  phone: string;
  salutation: "" | ContactSalutation; // "" = automatisch/unbekannt
}

const EMPTY: FormValues = { name: "", role: "", email: "", phone: "", salutation: "" };

function fromContact(c: LeadContact): FormValues {
  return {
    name: c.name ?? "",
    role: c.role ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    salutation: c.salutation ?? "",
  };
}

export function ContactsCard({ leadId, contacts, onChange }: Props) {
  const { addToast } = useToastContext();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleAdd(f: FormValues): Promise<boolean> {
    const res = await addContact({
      leadId,
      name: f.name,
      role: f.role || null,
      email: f.email || null,
      phone: f.phone || null,
      // "" → undefined: der Server raet die Anrede aus dem Vornamen.
      salutation: f.salutation || undefined,
    });
    if ("error" in res) {
      addToast(res.error, "error");
      return false;
    }
    const created: LeadContact = {
      id: res.contactId,
      lead_id: leadId,
      name: f.name.trim(),
      role: f.role.trim() || null,
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      salutation: f.salutation || null,
      source_url: null,
      source: "manual",
      created_at: new Date().toISOString(),
    };
    onChange([...contacts, created]);
    setAdding(false);
    addToast("Ansprechpartner angelegt", "success");
    return true;
  }

  async function handleEdit(id: string, f: FormValues): Promise<boolean> {
    const res = await updateContact(id, leadId, {
      name: f.name,
      role: f.role || null,
      email: f.email || null,
      phone: f.phone || null,
      salutation: f.salutation || null,
    });
    if ("error" in res) {
      addToast(res.error, "error");
      return false;
    }
    onChange(
      contacts.map((c) =>
        c.id === id
          ? {
              ...c,
              name: f.name.trim(),
              role: f.role.trim() || null,
              email: f.email.trim() || null,
              phone: f.phone.trim() || null,
              salutation: f.salutation || null,
            }
          : c,
      ),
    );
    setEditingId(null);
    addToast("Ansprechpartner aktualisiert", "success");
    return true;
  }

  async function handleDelete(id: string) {
    const prev = contacts;
    onChange(contacts.filter((c) => c.id !== id)); // optimistisch
    setEditingId(null);
    const res = await deleteContact(id, leadId);
    if ("error" in res) {
      addToast(res.error, "error");
      onChange(prev); // zuruecksetzen
    } else {
      addToast("Ansprechpartner gelöscht", "info");
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <User className="h-4 w-4 text-primary" /> Ansprechpartner
        </h3>
        {!adding && editingId === null && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" /> Hinzufügen
          </button>
        )}
      </div>

      {contacts.length === 0 && !adding ? (
        <p className="mt-2 text-sm text-gray-400">Keine Ansprechpartner hinterlegt.</p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id}>
                <ContactForm
                  initial={fromContact(c)}
                  submitLabel="Speichern"
                  onSubmit={(f) => handleEdit(c.id, f)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => handleDelete(c.id)}
                />
              </li>
            ) : (
              <li key={c.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  {/* Name (+ Rolle) ist klickbar → öffnet das Bearbeiten-Formular.
                      Fehlt der Name, lädt der Hinweis zum Nachtragen ein. */}
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setEditingId(c.id);
                    }}
                    title="Bearbeiten"
                    className="text-left font-medium text-gray-800 hover:text-primary dark:text-gray-200 dark:hover:text-primary"
                  >
                    {[c.salutation === "herr" ? "Herr" : c.salutation === "frau" ? "Frau" : null, c.name]
                      .filter(Boolean)
                      .join(" ") || <span className="italic text-gray-400">Name hinzufügen</span>}
                    {c.role && <span className="font-normal text-gray-500"> · {c.role}</span>}
                  </button>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary dark:text-gray-400"
                    >
                      <Phone className="h-3 w-3" /> {c.phone}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary dark:text-gray-400"
                    >
                      <Mail className="h-3 w-3" /> {c.email}
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(c.id);
                  }}
                  title="Bearbeiten"
                  aria-label={`${c.name || "Ansprechpartner"} bearbeiten`}
                  className="shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {adding && (
        <div className="mt-2.5">
          <ContactForm
            initial={EMPTY}
            submitLabel="Anlegen"
            onSubmit={handleAdd}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Formular (geteilt fuer Anlegen + Bearbeiten) ────────────────────────

function ContactForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial: FormValues;
  submitLabel: string;
  onSubmit: (f: FormValues) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [f, setF] = useState<FormValues>(initial);
  const [pending, setPending] = useState(false);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || pending) return;
    setPending(true);
    const ok = await onSubmit(f);
    if (!ok) setPending(false); // bei Erfolg unmountet das Formular ohnehin
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none dark:border-[#2c2c2e] dark:bg-[#161618] dark:text-gray-200";
  const labelCls = "mb-0.5 block text-xs font-medium text-gray-500 dark:text-gray-400";

  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-[#2c2c2e] dark:bg-[#161618]">
      <div>
        <label className={labelCls}>Name *</label>
        <input
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Name eingeben"
          autoFocus
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Anrede</label>
        <select
          value={f.salutation}
          onChange={(e) => set("salutation", e.target.value as FormValues["salutation"])}
          className={inputCls}
          aria-label="Anrede"
        >
          <option value="">Automatisch erkennen</option>
          <option value="herr">Herr</option>
          <option value="frau">Frau</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Rolle / Position</label>
        <input
          value={f.role}
          onChange={(e) => set("role", e.target.value)}
          placeholder="z. B. Inhaber, Geschäftsführer"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>E-Mail</label>
        <input
          value={f.email}
          onChange={(e) => set("email", e.target.value)}
          type="email"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Telefon</label>
        <input
          value={f.phone}
          onChange={(e) => set("phone", e.target.value)}
          className={inputCls}
        />
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="submit"
          disabled={!f.name.trim() || pending}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> {pending ? "Speichern…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" /> Abbrechen
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-3.5 w-3.5" /> Löschen
          </button>
        )}
      </div>
    </form>
  );
}
