import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { GlobalSearch } from "./global-search";
import { SwipeflowLogo } from "./swipeflow-logo";
import { ToastProvider } from "./toast-provider";
import { ServiceModeProvider } from "@/lib/service-mode";
import { ServiceModeSwitch } from "./service-mode-switch";
import type { ServiceMode } from "@/lib/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Service-Mode des aktuellen Users laden
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let serviceMode: ServiceMode = "recruiting";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("service_mode")
      .eq("id", user.id)
      .single();
    if (profile?.service_mode) serviceMode = profile.service_mode as ServiceMode;
  }

  return (
    <ServiceModeProvider initialMode={serviceMode}>
    <ToastProvider>
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white dark:border-gray-800/50 dark:bg-[#0d1321]">
        <div className="px-5 py-6">
          <Link href="/" className="block">
            <SwipeflowLogo className="h-7 w-auto text-gray-900 dark:text-white" />
            <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500">Lead Center</span>
          </Link>
        </div>

        <SidebarNav />

        <div className="mt-auto space-y-1 border-t border-gray-200 p-3 dark:border-gray-800/50">
          <ThemeToggle />
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
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 px-8 py-3 dark:border-gray-800/50">
          <ServiceModeSwitch />
          <GlobalSearch />
        </header>
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
    </ToastProvider>
    </ServiceModeProvider>
  );
}
