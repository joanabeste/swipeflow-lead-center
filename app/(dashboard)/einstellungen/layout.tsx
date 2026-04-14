import { createClient } from "@/lib/supabase/server";
import { SettingsSidebar } from "./_components/settings-sidebar";

export default async function EinstellungenLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

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
}
