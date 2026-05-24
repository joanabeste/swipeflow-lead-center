import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ensureLeadCoords } from "@/lib/geo/geocode";

/**
 * Lazy-Geocoding fuer den Lead-Preview-Drawer. Wird vom Client gefired,
 * nachdem das Daten-Bundle gerendert wurde — so blockiert der teure
 * Nominatim-Roundtrip nicht den initialen Render.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = createServiceClient();
  const { data: lead } = await db
    .from("leads")
    .select("id, latitude, longitude, street, zip, city, country, company_name")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const typed = lead as {
    id: string;
    latitude: number | null;
    longitude: number | null;
    street: string | null;
    zip: string | null;
    city: string | null;
    country: string | null;
    company_name: string;
  };

  if (typed.latitude != null && typed.longitude != null) {
    return NextResponse.json({ lat: typed.latitude, lng: typed.longitude });
  }

  const coords = await ensureLeadCoords(typed);
  if (!coords) return NextResponse.json({ lat: null, lng: null });
  return NextResponse.json({ lat: coords.lat, lng: coords.lng });
}
