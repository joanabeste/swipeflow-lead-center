"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import type { LatLng } from "@/lib/geo/distance";

// Leaflet-Default-Icon-URLs fixen (Webpack/Turbopack-Bug)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete ((L.Icon.Default.prototype as any)._getIconUrl);
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const hqIcon = L.divIcon({
  className: "",
  html: `<div style="background:#d2a966;border:2px solid white;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 2px #d2a966;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const leadIcon = L.divIcon({
  className: "",
  html: `<div style="background:#1f2937;border:2px solid white;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 2px #1f2937;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || points.length < 2) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 10 });
    fitted.current = true;
  }, [map, points]);
  return null;
}

interface Props {
  hq: LatLng;
  lead: LatLng;
}

export default function LeadMap({ hq, lead }: Props) {
  const center: [number, number] = [(hq.lat + lead.lat) / 2, (hq.lng + lead.lng) / 2];
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-[#2c2c2e]">
      <MapContainer
        center={center}
        zoom={7}
        scrollWheelZoom={false}
        style={{ height: 180, width: "100%" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Marker position={[hq.lat, hq.lng]} icon={hqIcon} />
        <Marker position={[lead.lat, lead.lng]} icon={leadIcon} />
        <Polyline
          positions={[[hq.lat, hq.lng], [lead.lat, lead.lng]]}
          pathOptions={{ color: "#d2a966", weight: 2, dashArray: "6 4" }}
        />
        <FitBounds points={[hq, lead]} />
      </MapContainer>
    </div>
  );
}
