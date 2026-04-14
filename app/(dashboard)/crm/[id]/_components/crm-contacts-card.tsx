"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, Trash2, Save } from "lucide-react";
import type { LeadContact } from "@/lib/types";
import { isHrContact } from "@/lib/recruiting/hr-contact";
import { addContact, updateContact, deleteContact } from "../../actions";
import { useToastContext } from "../../../toast-provider";
import { Card } from "./crm-shared";

export function CrmContactsCard({
  leadId, contacts,
}: { leadId: string; contacts: LeadContact[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const hrContacts = contacts.filter((c) => isHrContact(c.role));
  const otherContacts = contacts.filter((c) => !isHrContact(c.role));
  const ordered = [...hrContacts, ...otherContacts];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Ansprechpartner ({contacts.length})
          {hrContacts.length > 0 && (
            <span className="ml-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              · {hrContacts.length} HR
            </span>
          )}
        </h2>
        <button
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
          title="Ansprechpartner hinzufügen"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {adding && <ContactForm leadId={leadId} onClose={() => setAdding(false)} />}

      {contacts.length === 0 && !adding ? (
        <p className="mt-2 text-sm text-gray-400">Noch keine Kontakte.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {ordered.map((c) => {
            if (editingId === c.id) {
              return (
                <li key={c.id}>
                  <ContactForm leadId={leadId} contact={c} onClose={() => setEditingId(null)} />
                </li>
              );
            }
            return (
              <li key={c.id}>
                <ContactRow contact={c} leadId={leadId} onEdit={() => setEditingId(c.id)} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ContactRow({
  contact, leadId, onEdit,
}: { contact: LeadContact; leadId: string; onEdit: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [pending, startTransition] = useTransition();
  const isHr = isHrContact(contact.role);

  function handleDelete() {
    if (!confirm(`"${contact.name}" wirklich löschen?`)) return;
    startTransition(async () => {
      const res = await deleteContact(contact.id, leadId);
      if (res.error) addToast(res.error, "error");
      else {
        addToast("Kontakt gelöscht", "success");
        router.refresh();
      }
    });
  }

  return (
    <div
      className={`group relative rounded-md border p-2 ${
        isHr
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10"
          : "border-gray-100 dark:border-[#2c2c2e]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{contact.name}</p>
            {isHr && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                HR
              </span>
            )}
          </div>
          {contact.role && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{contact.role}</p>}
          <div className="mt-0.5 space-y-0.5 text-xs">
            {contact.email && (
              <a className="block truncate text-primary hover:underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a className="block truncate text-primary hover:underline" href={`tel:${contact.phone}`}>
                {contact.phone}
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={onEdit}
            className="rounded p-1 text-gray-400 opacity-70 transition hover:bg-white hover:text-gray-700 hover:opacity-100 dark:hover:bg-[#2c2c2e] dark:hover:text-gray-200"
            title="Bearbeiten"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={pending}
            className="rounded p-1 text-gray-400 opacity-70 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 dark:hover:bg-red-900/20"
            title="Löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactForm({
  leadId, contact, onClose,
}: { leadId: string; contact?: LeadContact; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToastContext();
  const [name, setName] = useState(contact?.name ?? "");
  const [role, setRole] = useState(contact?.role ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = contact
        ? await updateContact(contact.id, leadId, { name, role, email, phone })
        : await addContact({ leadId, name, role, email, phone });
      if (res.error) addToast(res.error, "error");
      else {
        addToast(contact ? "Kontakt aktualisiert" : "Kontakt angelegt", "success");
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-2 dark:bg-primary/10">
      <div className="space-y-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name *"
          autoFocus
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Rolle (z.B. HR-Manager)"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail"
          type="email"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefon"
          className="w-full rounded-md border border-gray-200 bg-white p-1.5 text-xs dark:border-[#2c2c2e] dark:bg-[#161618]"
        />
      </div>
      <div className="mt-2 flex justify-end gap-1">
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"
        >
          <X className="h-3 w-3" />
        </button>
        <button
          onClick={submit}
          disabled={pending || !name.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
        >
          <Save className="h-3 w-3" />
          {pending ? "…" : contact ? "Aktualisieren" : "Anlegen"}
        </button>
      </div>
    </div>
  );
}
