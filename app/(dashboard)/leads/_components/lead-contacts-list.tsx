import { User, Mail } from "lucide-react";
import type { LeadContact } from "@/lib/types";
import { isHrContact } from "@/lib/recruiting/hr-contact";
import { PhoneCallLink } from "@/components/phone-call-link";

export function LeadContactsList({
  leadId, contacts, hasWebsite,
}: { leadId: string; contacts: LeadContact[]; hasWebsite: boolean }) {
  const hrContacts = contacts.filter((c) => isHrContact(c.role));
  const otherContacts = contacts.filter((c) => !isHrContact(c.role));
  const ordered = [...hrContacts, ...otherContacts];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
          <User className="h-3.5 w-3.5" />
          Ansprechpartner ({contacts.length})
          {hrContacts.length > 0 && (
            <span className="ml-1 text-xs font-normal text-emerald-600 dark:text-emerald-400">
              · {hrContacts.length} HR
            </span>
          )}
        </h2>
      </div>
      {contacts.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400">
          {hasWebsite ? "Noch keine Kontakte — Lead anreichern um Kontakte zu finden." : "Keine Website vorhanden."}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {ordered.map((contact) => {
            const isHr = isHrContact(contact.role);
            return (
              <div
                key={contact.id}
                className={`flex items-start justify-between rounded-md border p-3 ${
                  isHr
                    ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10"
                    : "border-gray-100 dark:border-[#2c2c2e]"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{contact.name}</p>
                    {isHr && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        HR
                      </span>
                    )}
                  </div>
                  {contact.role && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{contact.role}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <PhoneCallLink
                        phone={contact.phone}
                        leadId={leadId}
                        contactId={contact.id}
                        className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
