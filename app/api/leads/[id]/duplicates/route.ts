import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { findLeadDuplicates } from "@/lib/leads/find-existing";

/**
 * Lazy-Endpoint fuer die Duplikat-Warnung eines Leads.
 *
 * findLeadDuplicates laedt den kompletten Lead-Bestand (Voll-Index) — das ist
 * der teuerste Teil der Detailansicht und waechst mit der Tabelle. Bewusst
 * NICHT mehr Teil von loadLeadDetail/loadCrmDetail: das Detail-Panel (Lead,
 * Notizen, Kontakte …) rendert sofort, die Duplikat-Pruefung wird hier
 * clientseitig nachgezogen (analog zu geocode/screenshot-url).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = createServiceClient();

  const { data: lead } = await db
    .from("leads")
    .select("id, company_name, website, email, phone, city")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!lead) return NextResponse.json({ duplicates: [] });

  const duplicates = await findLeadDuplicates(db, {
    id: lead.id as string,
    company_name: (lead.company_name as string | null) ?? null,
    website: (lead.website as string | null) ?? null,
    email: (lead.email as string | null) ?? null,
    phone: (lead.phone as string | null) ?? null,
    city: (lead.city as string | null) ?? null,
  });

  // Kein Cache: nach Merge/„kein Duplikat" muss die Liste sofort frisch sein.
  return NextResponse.json(
    { duplicates },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
