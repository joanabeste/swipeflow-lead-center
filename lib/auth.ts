// Zentrale Auth-Helpers fuer Server-Komponenten und Server-Actions.
// Ersetzt die historisch gewachsenen Inline-Checks in 5+ Actions und Layouts.
//
// Nutzung:
//   const { user, profile } = await requireUser();        // egal welche Rolle
//   const { user, profile } = await requireAdmin();       // 403 → redirect
//   const ctx = await requireSection("can_fulfillment");  // Sektion-Permission
//
// Server-Actions: Wenn redirect nicht erwuenscht (z.B. damit Action-Fehler im Toast
// landet), nutze stattdessen `checkAdmin()` (boolean) ohne redirect.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { permissionsFromProfile, type Profile, type SectionPermissions } from "@/lib/types";

export interface AuthContext {
  user: { id: string; email?: string | null };
  profile: Profile;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) return null;
  return { user: { id: user.id, email: user.email }, profile };
}

/** Layout/Page: leitet zu /login um wenn nicht eingeloggt. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Layout/Page: leitet zur Startseite mit Fehlermeldung um wenn nicht Admin. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireUser();
  if (ctx.profile.role !== "admin") redirect("/?error=forbidden");
  return ctx;
}

/** Layout/Page: leitet um wenn User keine Permission fuer die Sektion hat. */
export async function requireSection(section: keyof SectionPermissions): Promise<AuthContext> {
  const ctx = await requireUser();
  const perms = permissionsFromProfile(ctx.profile);
  if (!perms[section]) {
    // Wenn employee nur Zeit darf, soll er dorthin landen statt auf eine 403-Seite.
    redirect(perms.can_zeit ? "/zeit" : "/?error=no-section");
  }
  return ctx;
}

/** Server-Action: liefert ctx oder null. Kein redirect. Nutze fuer Actions, die
 *  Fehler-Strings statt Throws zurueckgeben wollen. */
export async function checkAuth(): Promise<AuthContext | null> {
  return getAuthContext();
}

/** Server-Action: prueft Admin ohne redirect. Wirft nichts. */
export async function checkAdmin(): Promise<AuthContext | null> {
  const ctx = await getAuthContext();
  if (!ctx) return null;
  if (ctx.profile.role !== "admin") return null;
  return ctx;
}
