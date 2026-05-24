import { requireAdmin } from "@/lib/auth";
import { SettingsSidebar } from "./_components/settings-sidebar";

export default async function EinstellungenLayout({ children }: { children: React.ReactNode }) {
  // Admin-Gate: leitet bei nicht-Admin sofort um, damit Server-Components NICHT
  // sensible Daten laden bevor 403-UI erscheint (Audit-Fix S3).
  await requireAdmin();

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
      <SettingsSidebar />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
