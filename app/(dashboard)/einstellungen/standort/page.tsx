import { MapPin } from "lucide-react";
import { getHqLocation } from "@/lib/app-settings";
import { PageHeader } from "../_components/ui";
import { HqLocationCard } from "../_components/hq-location-card";

export default async function StandortPage() {
  const hq = await getHqLocation();
  return (
    <div>
      <PageHeader
        icon={MapPin}
        category="Organisation"
        title="Unser Standort"
        subtitle="Wird auf der Karte im Lead-Profil als Ausgangspunkt für die Entfernung genutzt."
      />
      <HqLocationCard hq={hq} />
    </div>
  );
}
