import { createServiceClient } from "@/lib/supabase/server";
import type { LatLng } from "./distance";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "swipeflow-lead-center/1.0 (kontakt@swipeflow.de)";
const TIMEOUT_MS = 4000;

/** Adresse → Koordinaten via Nominatim (OpenStreetMap). null = kein Treffer / Fehler. */
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  if (!query?.trim()) return null;

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    countrycodes: "de",
    addressdetails: "0",
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "de",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string }[];
    if (!data || data.length === 0) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

interface MinimalLeadAddress {
  id: string;
  latitude: number | null;
  longitude: number | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  company_name: string;
}

/**
 * Stellt sicher, dass der Lead lat/lng hat. Geocodet bei Bedarf via Nominatim
 * und speichert das Ergebnis per Service-Client in die DB (Cache).
 * Gibt die Koordinaten zurück oder null falls keine Adresse vorhanden / Geocoding fehlgeschlagen.
 */
export async function ensureLeadCoords(lead: MinimalLeadAddress): Promise<LatLng | null> {
  if (lead.latitude != null && lead.longitude != null) {
    return { lat: lead.latitude, lng: lead.longitude };
  }

  // Adresse aufbauen — Präferenz: Straße + PLZ + Stadt
  const parts: string[] = [];
  if (lead.street) parts.push(lead.street);
  if (lead.zip) parts.push(lead.zip);
  if (lead.city) parts.push(lead.city);
  if (lead.country && lead.country.toLowerCase() !== "deutschland" && lead.country.toLowerCase() !== "de") {
    parts.push(lead.country);
  }

  // Fallback: nur Stadt + Firmenname
  if (parts.length === 0 && lead.city) parts.push(lead.city);
  if (parts.length === 0) return null;

  const query = parts.join(", ");
  const coords = await geocodeAddress(query);

  if (coords) {
    const db = createServiceClient();
    await db
      .from("leads")
      .update({
        latitude: coords.lat,
        longitude: coords.lng,
        geocoded_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
  } else {
    // Markiere als versucht, damit nicht bei jedem Seitenaufruf neu gepingt wird
    const db = createServiceClient();
    await db
      .from("leads")
      .update({ geocoded_at: new Date().toISOString() })
      .eq("id", lead.id);
  }

  return coords;
}
