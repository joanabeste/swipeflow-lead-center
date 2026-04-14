import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import type { Lead } from "@/lib/types";
import type { HqLocation } from "@/lib/app-settings";
import { haversineKm, distanceCategory } from "@/lib/geo/distance";

const LeadMap = dynamic(() => import("../lead-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[180px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-[#2c2c2e] dark:bg-[#232325]">
      Karte wird geladen…
    </div>
  ),
});

export function LeadLocationCard({ lead, hq }: { lead: Lead; hq: HqLocation }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-[#2c2c2e] dark:bg-[#1c1c1e]">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
        <MapPin className="h-3.5 w-3.5" />
        Standort
      </h2>
      {lead.latitude != null && lead.longitude != null ? (() => {
        const km = haversineKm({ lat: hq.lat, lng: hq.lng }, { lat: lead.latitude, lng: lead.longitude });
        const cat = distanceCategory(km);
        const badgeClasses: Record<typeof cat.tone, string> = {
          local: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
          regional: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
          far: "bg-gray-100 text-gray-600 dark:bg-[#232325] dark:text-gray-300",
        };
        return (
          <div className="mt-3">
            <LeadMap hq={{ lat: hq.lat, lng: hq.lng }} lead={{ lat: lead.latitude, lng: lead.longitude }} />
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold">{Math.round(km)} km</span>
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClasses[cat.tone]}`}>
                {cat.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Luftlinie von {hq.label}
            </p>
          </div>
        );
      })() : (
        <p className="mt-2 text-sm text-gray-400">
          {(lead.street || lead.zip || lead.city)
            ? "Adresse konnte nicht geokodiert werden."
            : "Keine Adresse hinterlegt."}
        </p>
      )}
    </div>
  );
}
