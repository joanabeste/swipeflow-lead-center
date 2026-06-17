import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Beacon-Endpoint fuer `navigator.sendBeacon` beim Schliessen/Verlassen des
 * Qualifizieren-Cockpits: gibt die Reservierungen des aktuellen Nutzers frei,
 * damit andere die Leads sofort bekommen. TTL ist der Backstop, falls der
 * Beacon mal nicht durchkommt.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = createServiceClient();
  await db.from("lead_qualify_claims").delete().eq("claimed_by", user.id);
  return NextResponse.json({ ok: true });
}
