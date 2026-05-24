import { requireZeitAdmin } from "@/lib/zeit/auth";

export default async function ZeitAdminLayout({ children }: { children: React.ReactNode }) {
  await requireZeitAdmin();
  return <>{children}</>;
}
