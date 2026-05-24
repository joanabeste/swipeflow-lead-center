import Link from "next/link";
import { LogOut, UserCircle } from "lucide-react";
import { logout } from "@/app/login/actions";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SidebarNav } from "./sidebar-nav";
import { SwipeflowLogo } from "./swipeflow-logo";
import { ToastProvider } from "./toast-provider";
import { ServiceModeProvider } from "@/lib/service-mode";
import { CallProvidersProvider } from "@/components/call-providers-context";
import { ConfettiProvider } from "@/components/confetti";
import { isPhoneMondoConfigured } from "@/lib/phonemondo/client";
import { getWebexCredentials } from "@/lib/webex/auth";
import type { ServiceMode, UserRole } from "@/lib/types";
import { loadPendingAbsencesCount, loadRunningEntry } from "./zeit/_components/data-helpers";
import { HeaderBar } from "./_components/header-bar";
import { SidebarSubtitle } from "./_components/sidebar-subtitle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Service-Mode + Rolle des aktuellen Users laden
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let serviceMode: ServiceMode = "recruiting";
  let role: UserRole | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("service_mode, role")
      .eq("id", user.id)
      .single();
    if (profile?.service_mode) serviceMode = profile.service_mode as ServiceMode;
    if (profile?.role) role = profile.role as UserRole;
  }

  const webexCreds = user ? await getWebexCredentials() : null;
  const callProviders = {
    phonemondo: isPhoneMondoConfigured(),
    webex: webexCreds !== null,
  };

  // Badge-Counter für die Sidebar — überfällig + heute fällig.
  // Service-Client umgeht RLS, weil der Counter aggregiert ist.
  const today = new Date().toISOString().slice(0, 10);
  let todosDueOrOverdue = 0;
  try {
    const db = createServiceClient();
    const { count } = await db
      .from("lead_todos")
      .select("id", { count: "exact", head: true })
      .is("done_at", null)
      .lte("due_date", today);
    todosDueOrOverdue = count ?? 0;
  } catch {
    // Tabelle fehlt o.Ä. — Badge bleibt 0
  }

  // Zeit-spezifische Daten — defensiv (Migrationen koennen noch fehlen).
  const [runningEntry, absencesPending] = user
    ? await Promise.all([
        loadRunningEntry(user.id),
        role === "admin" ? loadPendingAbsencesCount() : Promise.resolve(0),
      ])
    : [null, 0];

  return (
    <ServiceModeProvider initialMode={serviceMode}>
    <CallProvidersProvider value={callProviders}>
    <ConfettiProvider>
    <ToastProvider>
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white dark:border-[#2c2c2e]/50 dark:bg-[#161618]">
        <div className="px-5 py-7">
          <Link href="/" className="block">
            <SwipeflowLogo className="h-9 w-auto text-gray-900 dark:text-white" />
            <SidebarSubtitle />
          </Link>
        </div>

        <SidebarNav
          badges={{ todos_due_today_or_overdue: todosDueOrOverdue, absences_pending: absencesPending }}
          role={role}
        />

        <div className="mt-auto space-y-1 border-t border-gray-200 p-3 dark:border-[#2c2c2e]/50">
          <Link
            href="/mein-konto"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
          >
            <UserCircle className="h-4 w-4" />
            Mein Konto
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
            >
              <LogOut className="h-4 w-4" />
              Abmelden
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      {/* min-h-0 + min-w-0: ohne das bläht langer Content das flex-Child über
          100vh auf, body scrollt selbst und die Sidebar wandert aus dem Viewport. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <HeaderBar
          running={runningEntry ? { id: runningEntry.id, started_at: runningEntry.started_at, note: runningEntry.note } : null}
        />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
    </ToastProvider>
    </ConfettiProvider>
    </CallProvidersProvider>
    </ServiceModeProvider>
  );
}
