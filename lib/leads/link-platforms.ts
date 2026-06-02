import { normalizeDomain, isGenericDomain } from "@/lib/csv/dedup";
import type { LeadLinkType } from "@/lib/types";

/**
 * Plattform-Erkennung + Anzeige für Lead-Links/Profile.
 *
 * Bewusst OHNE lucide-Marken-Icons (lucide-react v1 hat keine Instagram/Facebook-
 * Icons → Build-Bruch): die UI zeigt einen Text-Badge mit dem Label + einer
 * neutralen Badge-Farbe.
 */

const HOST_TYPE: Record<string, LeadLinkType> = {
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "fb.me": "facebook",
  "instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "xing.com": "xing",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "tiktok.com": "tiktok",
  "twitter.com": "twitter",
  "x.com": "twitter",
};

/** Erkennt Google-Maps-/Business-Profil-Links (Domain + Pfad). */
function isGoogleMapsUrl(url: string): boolean {
  let host = "";
  let path = "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    host = u.hostname.toLowerCase().replace(/^www\./, "");
    path = u.pathname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "g.page" || host === "maps.app.goo.gl") return true;
  if (host.startsWith("maps.google.")) return true;
  if ((host === "google.com" || host.endsWith(".google.com") || /^google\.[a-z.]+$/.test(host)) && path.includes("/maps")) {
    return true;
  }
  if (host === "goo.gl" && path.includes("/maps")) return true;
  return false;
}

/** Ermittelt den Link-Typ aus der URL. Reihenfolge: Social → Google Maps →
 *  Branchenverzeichnis/Portal (bekannte generische Domains) → Website. */
export function detectLinkType(url: string | null | undefined): LeadLinkType {
  if (!url) return "website";
  const d = normalizeDomain(url);
  if (!d) return "website";
  // 1) Social-Profile
  if (HOST_TYPE[d]) return HOST_TYPE[d];
  const parts = d.split(".");
  if (parts.length > 2) {
    const core = parts.slice(-2).join(".");
    if (HOST_TYPE[core]) return HOST_TYPE[core];
  }
  // 2) Google Maps / Business-Profil
  if (isGoogleMapsUrl(url)) return "google_maps";
  // 3) Branchenverzeichnis / Portal (gelbeseiten, malerfinder, …)
  if (isGenericDomain(d)) return "directory";
  // 4) sonst echte Website
  return "website";
}

const TYPE_LABEL: Record<LeadLinkType, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  xing: "Xing",
  youtube: "YouTube",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  google_maps: "Google Maps",
  directory: "Branchenverzeichnis",
  website: "Website",
  other: "Link",
};

export function linkTypeLabel(type: string | null | undefined): string {
  return TYPE_LABEL[(type ?? "other") as LeadLinkType] ?? "Link";
}

/** Tailwind-Klassen für den Typ-Badge (neutral pro Plattform — keine Marken-Icons). */
const TYPE_BADGE: Record<LeadLinkType, string> = {
  facebook: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  instagram: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  linkedin: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  xing: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  youtube: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  tiktok: "bg-gray-200 text-gray-800 dark:bg-white/10 dark:text-gray-200",
  twitter: "bg-gray-200 text-gray-800 dark:bg-white/10 dark:text-gray-200",
  google_maps: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  directory: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  website: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  other: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
};

export function linkTypeBadgeClass(type: string | null | undefined): string {
  return TYPE_BADGE[(type ?? "other") as LeadLinkType] ?? TYPE_BADGE.other;
}
