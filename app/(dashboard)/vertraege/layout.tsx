import { requireSection } from "@/lib/auth";

export default async function VertraegeLayout({ children }: { children: React.ReactNode }) {
  await requireSection("can_vertraege");
  return <>{children}</>;
}
