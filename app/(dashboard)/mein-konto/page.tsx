import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";
import { AvatarUpload } from "./avatar-upload";
import { SalutationBackfillButton } from "./salutation-backfill-button";
import { ResetDashboardButton } from "./reset-dashboard-button";
import { ThemeToggle } from "../theme-toggle";

export default async function MeinKontoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, role, status, service_mode, avatar_url")
    .eq("id", user!.id)
    .single();

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

      {/* Wartung */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="font-semibold">Wartung</h2>

        <div className="mt-4">
          <p className="text-sm font-medium">Anrede aus Vornamen nachtragen</p>
          <p className="mb-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Leitet fehlende Anreden (Herr/Frau) aus den Vornamen deiner Kontakte ab. Mehrdeutige Namen bleiben unverändert.
          </p>
          <SalutationBackfillButton />
        </div>

        <div className="mt-5 border-t border-gray-100 pt-5 dark:border-[#2c2c2e]">
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
