import { createServiceClient } from "@/lib/supabase/server";
import { normalizeNumber } from "@/lib/webex/recordings";

/**
 * Findet den relevantesten Lead für eine Anrufernummer (Inbound-Call-Routing).
 *
 * Prüft sowohl `leads.phone` als auch `lead_contacts.phone`. Bei Mehrfach-Treffern
 * gewinnt der Lead mit dem jüngsten `updated_at` — praktisch derjenige, mit dem
 * gerade kommuniziert wird. Gibt `null` zurück, wenn keine Nummer passt.
 *
 * Matching-Strategie: wir laden Kandidaten grob per ILIKE mit den letzten 8
 * Ziffern und filtern dann normalisiert (alle Nicht-Ziffern entfernt, führende
 * Nullen gestrippt). Damit sind Formate wie +49 160 9218 1021, 004916092181021
 * und 016092181021 austauschbar.
 */
export async function findLeadByPhone(
  phone: string | null,
): Promise<{ leadId: string; contactId: string | null } | null> {
  if (!phone) return null;
  const db = createServiceClient();
  const normalized = normalizeNumber(phone);
  if (!normalized) return null;
  const suffix = normalized.slice(-8);

  const [{ data: leads }, { data: contacts }] = await Promise.all([
    db
      .from("leads")
      .select("id, phone, updated_at")
      .ilike("phone", `%${suffix}%`)
      .is("deleted_at", null)
      .limit(20),
    db
      .from("lead_contacts")
      .select("id, lead_id, phone, leads:leads(id, updated_at)")
      .ilike("phone", `%${suffix}%`)
      .limit(20),
  ]);

  const candidates: Array<{ leadId: string; contactId: string | null; updatedAt: string | null }> = [];

  for (const l of leads ?? []) {
    if (normalizeNumber(l.phone) === normalized) {
      candidates.push({ leadId: l.id as string, contactId: null, updatedAt: (l.updated_at as string | null) ?? null });
    }
  }
  for (const c of contacts ?? []) {
    if (normalizeNumber(c.phone) === normalized) {
      const leadRel = c.leads as unknown as { updated_at?: string | null } | null;
      candidates.push({
        leadId: c.lead_id as string,
        contactId: c.id as string,
        updatedAt: leadRel?.updated_at ?? null,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return { leadId: candidates[0].leadId, contactId: candidates[0].contactId };
}
