import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ihre persönliche Zusammenfassung",
  robots: { index: false, follow: false },
};

export default function LandingPageLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-gray-900">{children}</div>;
}
