export interface LatLng {
  lat: number;
  lng: number;
}

/** Luftlinien-Entfernung in km (Haversine) */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // Erdradius km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Farb-Kategorie je nach Entfernung */
export function distanceCategory(km: number): {
  label: string;
  tone: "local" | "regional" | "far";
} {
  if (km <= 30) return { label: "lokal", tone: "local" };
  if (km <= 100) return { label: "regional", tone: "regional" };
  return { label: "weit", tone: "far" };
}
