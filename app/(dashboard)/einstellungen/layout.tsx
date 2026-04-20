import { createClient } from "@/lib/supabase/server";
import { SettingsSidebar } from "./_components/settings-sidebar";

export default async function EinstellungenLayout({ children }: { children: React.ReactNode }) {
  // Defensive Diagnostik: statt in die Error-Boundary zu rutschen zeigen wir
  // die eigentliche Fehlerursache direkt im UI (keine Digest-Sanitization).
  try {
    const supabase = await createClient();

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw new Error(`Auth-Fehler: ${authErr.message}`);
    const user = userData.user;
    if (!user) throw new Error("Keine User-Session im Layout (Proxy-Umgehung?)");

    const { data: currentProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileErr) {
      throw new Error(`Profile-Query: ${profileErr.message} (code ${profileErr.code})`);
    }

    if (currentProfile?.role !== "admin") {
      return (
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Nur Administratoren haben Zugriff auf die Einstellungen.
          </p>
        </div>
      );
    }

    return (
      <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <SettingsSidebar />
        <main className="min-w-0">{children}</main>
      </div>
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[einstellungen-layout] rendering failed:", msg, stack);
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-900/20">
        <h2 className="font-semibold text-red-900 dark:text-red-200">
          Einstellungs-Layout: Fehler beim Laden
        </h2>
        <p className="mt-2 text-sm text-red-800 dark:text-red-300">
          Dies ist eine Diagnose-Ansicht — statt der generischen Error-Boundary zeigen
          wir hier den echten Fehler, um die Ursache zu finden.
        </p>
        <pre className="mt-3 overflow-auto rounded bg-red-100 p-3 font-mono text-[11px] text-red-900 dark:bg-red-950/50 dark:text-red-300">
          {msg}
          {stack ? `\n\n${stack}` : ""}
        </pre>
      </div>
    );
  }
}
