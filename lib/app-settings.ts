import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface HqLocation {
  lat: number;
  lng: number;
  label: string;
  address: string;
}

const FALLBACK_HQ: HqLocation = {
  lat: 52.38228,
  lng: 8.62305,
  label: "swipeflow GmbH",
  address: "Espelkamp",
};

/** Standort des eigenen Büros/HQ */
export async function getHqLocation(): Promise<HqLocation> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "hq_location")
      .single();
    const v = data?.value as Partial<HqLocation> | undefined;
    if (!v || typeof v.lat !== "number" || typeof v.lng !== "number") {
      return FALLBACK_HQ;
    }
    return {
      lat: v.lat,
      lng: v.lng,
      label: v.label ?? FALLBACK_HQ.label,
      address: v.address ?? FALLBACK_HQ.address,
    };
  } catch {
    return FALLBACK_HQ;
  }
}

/** HQ-Standort speichern (via Service-Client, Admin-Check beim Caller) */
export async function saveHqLocation(hq: HqLocation, userId: string | null): Promise<void> {
  const db = createServiceClient();
  await db.from("app_settings").upsert(
    {
      key: "hq_location",
      value: hq as unknown as Record<string, unknown>,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}
