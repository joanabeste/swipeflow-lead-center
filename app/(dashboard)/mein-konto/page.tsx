import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";
import { PhonemondoForm } from "./phonemondo-form";

export default async function MeinKontoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, role, status, service_mode, phonemondo_extension")
    .eq("id", user!.id)
    .single();

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

      {/* PhoneMondo */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="font-semibold">Telefon (PhoneMondo)</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Wähle dein PhoneMondo-Telefon (Source). Beim Click-to-Call im CRM
          ruft PhoneMondo zuerst dieses Gerät an und verbindet dich dann
          mit dem Lead. Tipp: Klick auf &bdquo;Sources laden&ldquo; holt deine verfügbaren
          Geräte direkt aus deinem PhoneMondo-Account.
        </p>
        <PhonemondoForm extension={profile?.phonemondo_extension ?? null} />
      </div>

      {/* Passwort ändern */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
        <h2 className="font-semibold">Passwort ändern</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Vergib ein neues Passwort. Mindestens 8 Zeichen.
        </p>
        <AccountForm />
      </div>
    </div>
  );
}
