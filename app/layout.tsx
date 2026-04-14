import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/lib/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Lead Center",
    template: "%s · Lead Center",
  },
  description: "Zentrales Lead-Management für swipeflow GmbH",
  applicationName: "Lead Center",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Lead Center",
    description: "Zentrales Lead-Management für swipeflow GmbH",
    type: "website",
    locale: "de_DE",
    siteName: "Lead Center",
  },
  twitter: {
    card: "summary",
    title: "Lead Center",
    description: "Zentrales Lead-Management für swipeflow GmbH",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
    >
      <body className="h-full bg-gray-50 font-sans text-gray-900 antialiased dark:bg-[#111113] dark:text-gray-100" suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
