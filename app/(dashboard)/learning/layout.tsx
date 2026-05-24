import { requireSection } from "@/lib/auth";

export default async function LearningLayout({ children }: { children: React.ReactNode }) {
  await requireSection("can_learning");
  return <>{children}</>;
}
