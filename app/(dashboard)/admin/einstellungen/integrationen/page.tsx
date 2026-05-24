import Link from "next/link";
import { Phone, Video, Mail, CheckSquare, FileText, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

interface Integration {
  id: string;
  label: string;
  desc: string;
  href: string;
  icon: typeof Phone;
  status?: "connected" | "disconnected" | "unknown";
  statusLabel?: string;
}

async function loadStatuses(): Promise<Record<string, { connected: boolean; label: string }>> {
  const db = createServiceClient();
  const results: Record<string, { connected: boolean; label: string }> = {};

  // ClickUp — eigene Tabelle.
  try {
    const { data } = await db
      .from("app_integrations")
      .select("workspace_id, workspace_name")
      .eq("provider", "clickup")
      .maybeSingle();
    results.clickup = data?.workspace_id
      ? { connected: true, label: `Workspace: ${data.workspace_name ?? data.workspace_id}` }
      : { connected: false, label: "Kein Token konfiguriert" };
  } catch {
    results.clickup = { connected: false, label: "Kein Token konfiguriert" };
  }

  // PhoneMondo — env-basiert (PHONEMONDO_API_TOKEN).
  results.phonemondo = process.env.PHONEMONDO_API_TOKEN
    ? { connected: true, label: "API-Token gesetzt" }
    : { connected: false, label: "PHONEMONDO_API_TOKEN fehlt" };

  // Webex — credentials lazy, schwer global zu pruefen. Nur Link.
  results.webex = { connected: false, label: "Pro-User konfigurierbar" };

  // SMTP / E-Mail — credentials pro User (lib/email/user-credentials).
  results.email = { connected: false, label: "Pro-User SMTP-Settings" };

  return results;
}

const INTEGRATIONS: Integration[] = [
  { id: "clickup", label: "ClickUp", desc: "Task-Sync fuer Fulfillment-Projekte (Lesen, Anlegen, Schliessen).", href: "/fulfillment/einstellungen", icon: CheckSquare },
  { id: "phonemondo", label: "PhoneMondo", desc: "Auto-Dialer fuer den Vertriebs-Workflow (Click-to-Call, Anruf-Tracking).", href: "/einstellungen/phonemondo", icon: Phone },
  { id: "webex", label: "Webex", desc: "Call-Recording und Meeting-Integration fuer Vertrieb.", href: "/einstellungen/webex", icon: Video },
  { id: "email", label: "E-Mail (SMTP)", desc: "Pro-User-SMTP fuer ausgehende Mails aus dem CRM.", href: "/einstellungen/email", icon: Mail },
  { id: "vorlagen", label: "E-Mail-Vorlagen", desc: "Wiederverwendbare Templates fuer den Mail-Versand.", href: "/einstellungen/email-vorlagen", icon: FileText },
];

export default async function AdminIntegrationenPage() {
  await requireAdmin();
  const statuses = await loadStatuses();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Integrationen</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Zentrale Uebersicht aller externen Verbindungen. Klick auf eine Integration oeffnet die Konfiguration.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {INTEGRATIONS.map((i) => {
          const s = statuses[i.id];
          return (
            <Link
              key={i.id}
              href={i.href}
              className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-primary/40 hover:shadow-sm dark:border-[#2c2c2e]/50 dark:bg-[#161618] dark:hover:border-primary/40"
            >
              <div className={`rounded-xl p-2.5 ${s?.connected ? "bg-green-50 text-green-600 dark:bg-green-900/20" : "bg-gray-50 text-gray-400 dark:bg-[#1c1c1e]"}`}>
                <i.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{i.label}</h3>
                  {s?.connected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                      <CheckCircle2 className="h-3 w-3" /> verbunden
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-[#2c2c2e]">
                      <XCircle className="h-3 w-3" /> nicht verbunden
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{i.desc}</p>
                {s && <p className="mt-1 text-[11px] text-gray-400">{s.label}</p>}
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-primary" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
