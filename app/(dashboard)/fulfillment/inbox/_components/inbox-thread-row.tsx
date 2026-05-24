"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { attachThreadToLead } from "../../mail-actions";
import { useToastContext } from "../../../toast-provider";

interface Props {
  threadId: string;
  leadId: string | null;
  subject: string;
  unreadCount: number;
  leadName: string | null;
  participants: string[];
  lastMessageAt: string | null;
  customers: Array<{ id: string; company_name: string }>;
}

export function InboxThreadRow({ threadId, leadId, subject, unreadCount, leadName, participants, lastMessageAt, customers }: Props) {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assignOpen, setAssignOpen] = useState(false);

  function handleAssign(targetLeadId: string) {
    startTransition(async () => {
      const res = await attachThreadToLead({ threadId, leadId: targetLeadId });
      if ("error" in res) {
        addToast(res.error, "error");
        return;
      }
      addToast("Thread zugeordnet.", "success");
      router.push(`/fulfillment/kunden/${targetLeadId}?tab=mails&thread=${threadId}`);
    });
  }

  const dateLabel = lastMessageAt ? new Date(lastMessageAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";

  if (leadId) {
    return (
      <Link
        href={`/fulfillment/kunden/${leadId}?tab=mails&thread=${threadId}`}
        className="block rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50 dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:bg-white/5"
      >
        <ThreadRowContent subject={subject} unreadCount={unreadCount} leadName={leadName} participants={participants} dateLabel={dateLabel} unassigned={false} />
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
      <ThreadRowContent subject={subject} unreadCount={unreadCount} leadName={null} participants={participants} dateLabel={dateLabel} unassigned />
      <div className="mt-2 flex items-center gap-2">
        {assignOpen ? (
          <>
            <select
              autoFocus
              defaultValue=""
              disabled={pending}
              onChange={(e) => e.target.value && handleAssign(e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-[#2c2c2e]/60 dark:bg-[#1c1c1e]"
            >
              <option value="" disabled>Kunde wählen…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
            <button type="button" onClick={() => setAssignOpen(false)} className="text-[11px] text-gray-500 hover:text-gray-700">Abbrechen</button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            disabled={pending}
            className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:border-[#2c2c2e]/60 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Kunde zuordnen
          </button>
        )}
      </div>
    </div>
  );
}

function ThreadRowContent({ subject, unreadCount, leadName, participants, dateLabel, unassigned }: {
  subject: string; unreadCount: number; leadName: string | null; participants: string[]; dateLabel: string; unassigned: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="line-clamp-1 text-sm font-medium">{subject}</p>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-gray-900">{unreadCount}</span>
          )}
          {unassigned && (
            <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              nicht zugeordnet
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
          {leadName && <span className="text-primary">{leadName} · </span>}
          {(participants ?? []).slice(0, 3).join(", ")}
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-gray-400">{dateLabel}</span>
    </div>
  );
}
