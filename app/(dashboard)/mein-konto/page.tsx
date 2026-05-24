import { Mail, Inbox, FileText, Sparkles } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getUserSmtp, getUserImap } from "@/lib/email/user-credentials";
import { listTemplates } from "@/lib/email/templates-server";
import { AccountForm } from "./account-form";
import { AvatarUpload } from "./avatar-upload";
import { ResetDashboardButton } from "./reset-dashboard-button";
import { ThemeToggle } from "../theme-toggle";
import { EmailSettingsCard } from "../einstellungen/email/email-settings-card";
import { ImapSettingsCard } from "../einstellungen/email/imap-settings-card";
import { EmailTemplatesManager } from "../einstellungen/_components/email-templates-manager";
import { SignatureCard } from "./_components/signature-card";
import { BackfillCard } from "./_components/backfill-card";
import { getBackfillSettings } from "@/lib/email/user-credentials";

async function loadSignature(userId: string): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.from("user_settings").select("signature").eq("user_id", userId).maybeSingle();
  return ((data?.signature as string | null) ?? null) || null;
}

export default async function MeinKontoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, role, status, service_mode, avatar_url")
    .eq("id", user!.id)
    .single();

  // Mail-Konfiguration des Users — laeuft per-User, gehoert hierhin und nicht in den Admin-Bereich.
  const [smtp, imap, templates, signature, backfill] = await Promise.all([
    user ? getUserSmtp(user.id) : Promise.resolve(null),
    user ? getUserImap(user.id) : Promise.resolve(null),
    user ? listTemplates(user.id) : Promise.resolve([]),
    user ? loadSignature(user.id) : Promise.resolve(null),
    user ? getBackfillSettings(user.id) : Promise.resolve({ days: 30, deepSyncRequestedAt: null }),
  ]);

  const name = (profile?.name as string | null) ?? "";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || (user?.email?.[0]?.toUpperCase() ?? "?");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Mein Konto</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Profil und Passwort verwalten
      </p>

      {/* Profilbild */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="font-semibold">Profilbild</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Wird neben deinen Notizen und Anrufen in der CRM-Historie angezeigt.
        </p>
        <div className="mt-4">
          <AvatarUpload
            currentUrl={(profile?.avatar_url as string | null) ?? null}
            fallback={initials}
          />
        </div>
      </div>

      {/* Profil-Übersicht */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="font-semibold">Profil</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Name</dt>
            <dd className="mt-1">{profile?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">E-Mail</dt>
            <dd className="mt-1">{profile?.email ?? user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Rolle</dt>
            <dd className="mt-1 capitalize">{profile?.role === "admin" ? "Administrator" : "Benutzer"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Service-Modus</dt>
            <dd className="mt-1">{profile?.service_mode === "webdev" ? "Webentwicklung" : "Recruiting"}</dd>
          </div>
        </dl>
      </div>

      {/* Passwort ändern */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="font-semibold">Passwort ändern</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Vergib ein neues Passwort. Mindestens 8 Zeichen.
        </p>
        <AccountForm />
      </div>

      {/* Darstellung */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="font-semibold">Darstellung</h2>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">
          Helles oder dunkles Design für die gesamte App.
        </p>
        <ThemeToggle />
      </div>

      {/* E-Mail — SMTP (Versand) */}
      <div id="email" className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-gray-500" /> E-Mail-Versand (SMTP)</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Deine eigenen SMTP-Zugangsdaten. Mails aus dem Tool gehen damit von deiner Adresse raus.
        </p>
        <div className="mt-4">
          <EmailSettingsCard smtp={smtp} />
        </div>
      </div>

      {/* E-Mail — IMAP (Posteingang) */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="flex items-center gap-2 font-semibold"><Inbox className="h-4 w-4 text-gray-500" /> Posteingang (IMAP)</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Mit IMAP zieht das Tool deinen Posteingang + Sent-Ordner und zeigt die Verläufe pro Kunde / Projekt. Mails aus Thunderbird tauchen automatisch auf.
        </p>
        <div className="mt-4">
          <ImapSettingsCard imap={imap} hasSmtp={!!smtp} />
        </div>
        {imap && (
          <div className="mt-6 border-t border-gray-100 pt-6 dark:border-[#2c2c2e]/40">
            <BackfillCard initial={{ days: backfill.days, deepSyncPending: !!backfill.deepSyncRequestedAt }} />
          </div>
        )}
      </div>

      {/* E-Mail-Signatur */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> E-Mail-Signatur</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Wird automatisch an jede aus dem Tool gesendete Mail angehängt. Lass sie aus deinen bisherigen Sent-Mails extrahieren oder editiere sie manuell.
        </p>
        <div className="mt-4">
          <SignatureCard initial={signature} />
        </div>
      </div>

      {/* E-Mail-Vorlagen */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4 text-gray-500" /> E-Mail-Vorlagen</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Wiederverwendbare Vorlagen mit Variablen. Built-in: <code className="text-xs">{`{{contact_name}}`}</code>, <code className="text-xs">{`{{contact_first_name}}`}</code>, <code className="text-xs">{`{{company_name}}`}</code>, <code className="text-xs">{`{{sender_name}}`}</code>.
        </p>
        <div className="mt-4">
          <EmailTemplatesManager templates={templates} />
        </div>
      </div>

      {/* Wartung */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="font-semibold">Wartung</h2>

        <div className="mt-4">
          <p className="text-sm font-medium">Dashboard zurücksetzen</p>
          <p className="mb-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Setzt dein Übersicht-Layout auf den aktuellen Default zurück (Widgets, Reihenfolge, Breiten). Sinnvoll, wenn wir das Default-Layout verbessert haben und du es übernehmen willst.
          </p>
          <ResetDashboardButton />
        </div>
      </div>
    </div>
  );
}
