import { redirect } from "next/navigation";
import { getZeitContext } from "@/lib/zeit/auth";

export default async function ZeitLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getZeitContext();
  if (!ctx) redirect("/login");
  return <>{children}</>;
}
