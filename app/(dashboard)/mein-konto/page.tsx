import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";

export default async function MeinKontoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, role, status, service_mode")
    .eq("id", user!.id)
    .single();

  // Prüfen ob User schon ein Passwort hat (via sign_in_provider in user_metadata)
  // Wenn User nur per Magic Link eingeloggt war, hat er evtl. noch kein Passwort
  const hasPassword = user?.app_metadata?.providers?.includes("email") ?? true;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Mein Konto</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Profil und Passwort verwalten
      </p>

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
          {hasPassword
            ? "Geben Sie Ihr aktuelles Passwort und das neue Passwort ein."
            : "Sie haben bisher noch kein Passwort gesetzt. Legen Sie hier Ihr erstes Passwort fest."}
        </p>
        <AccountForm hasPassword={hasPassword} />
      </div>
    </div>
  );
}
