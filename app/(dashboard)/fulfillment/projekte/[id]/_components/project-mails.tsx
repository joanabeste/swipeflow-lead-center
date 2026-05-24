"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Inbox, ExternalLink, X } from "lucide-react";
import type { ThreadRow } from "@/lib/email/data";
import { assignThreadToProject } from "../../../mail-actions";
import { useToastContext } from "../../../../toast-provider";
import { useRouter } from "next/navigation";

export function ProjectMails({ projectId, leadId, threads }: { projectId: string; leadId: string; threads: ThreadRow[] }) {
  const { addToast } = useToastContext();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function unassign(threadId: string) {
    startTransition(async () => {
      const res = await assignThreadToProject({ threadId, projectId: null });
      if ("error" in res) addToast(res.error, "error");
      else {
        addToast("Mail vom Projekt entfernt.", "success");
        router.refresh();
      }
    });
  }

  if (threads.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center dark:border-[#2c2c2e]/60">
        <Inbox className="mx-auto mb-2 h-6 w-6 text-gray-300" />
        <p className="text-sm text-gray-400">Noch keine Mails diesem Projekt zugeordnet.</p>
        <Link
          href={`/fulfillment/kunden/${leadId}?tab=mails`}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Im Kunden-Posteingang zuordnen <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {threads.map((t) => (
        <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
          <Link
            href={`/fulfillment/kunden/${leadId}?tab=mails`}
            className="min-w-0 flex-1"
          >
            <p className="line-clamp-1 text-sm font-medium">{t.subject_normalized || "(ohne Betreff)"}</p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
              {t.message_count} Nachricht{t.message_count === 1 ? "" : "en"}
              {t.last_message_at && ` · ${new Date(t.last_message_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}`}
              {t.unread_count > 0 && (
                <span className="ml-2 inline-flex rounded-full bg-primary px-1.5 text-[10px] font-semibold text-gray-900">{t.unread_count} neu</span>
              )}
            </p>
          </Link>
          <button
            type="button"
            onClick={() => unassign(t.id)}
            disabled={pending}
            title="Vom Projekt entfernen (bleibt beim Kunden)"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-white/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
