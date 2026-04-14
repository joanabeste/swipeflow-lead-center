import dynamic from "next/dynamic";
import type { HqLocation } from "@/lib/app-settings";
import { haversineKm, distanceCategory } from "@/lib/geo/distance";
import { Card } from "./crm-shared";

const LeadMap = dynamic(() => import("../../../leads/lead-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[150px] items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-[#2c2c2e] dark:bg-[#232325]">
      Karte wird geladen…
    </div>
  ),
});

export function CrmLocationMiniCard({
  lat, lng, hq,
}: { lat: number; lng: number; hq: HqLocation }) {
  const km = haversineKm({ lat: hq.lat, lng: hq.lng }, { lat, lng });
  const cat = distanceCategory(km);
  const tones: Record<typeof cat.tone, string> = {
    local: "text-green-600 dark:text-green-400",
    regional: "text-yellow-600 dark:text-yellow-400",
    far: "text-gray-500",
  };

  return (
    <Card>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Standort
      </h2>
      <div className="mt-2">
        <LeadMap hq={{ lat: hq.lat, lng: hq.lng }} lead={{ lat, lng }} />
      </div>
      <p className="mt-2 text-sm">
        <span className="font-bold">{Math.round(km)} km</span>
        <span className={`ml-2 text-xs ${tones[cat.tone]}`}>{cat.label}</span>
      </p>
    </Card>
  );
}
