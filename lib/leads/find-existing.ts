import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findDbDuplicateForLead,
  isLeadArchived,
  loadExistingLeadsIndex,
  type DuplicateMatch,
} from "@/lib/csv/dedup";
import { normalizeEmail, normalizePhone } from "@/lib/csv/normalizer";

/**
 * Sucht zu einem manuell angelegten / einzeln eingegebenen Lead-Kandidaten
 * einen bereits bestehenden DB-Lead. Im Gegensatz zum Batch-Import laedt diese
 * Funktion KEINEN Vollindex, wenn ein gezielter eq-Lookup auf Email/Phone
 * bereits trifft — das spart bei UI-Eingaben hunderte Roundtrips.
 *
 * Liefert null, wenn keine Match-relevanten Felder gesetzt sind.
 */
export async function findExistingLeadForManual(
  db: SupabaseClient,
  candidate: {
    company_name?: string | null;
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
  },
): Promise<DuplicateMatch | null> {
  const hasAny =
    !!candidate.company_name ||
    !!candidate.website ||
    !!candidate.email ||
    !!candidate.phone;
  if (!hasAny) return null;

  // Helper: lade den Archiv-Status-Set einmalig, wenn wir einen Direkt-Hit haben.
  const buildArchivedSet = async (): Promise<Set<string>> => {
    const { data: archivedRows } = await db
      .from("custom_lead_statuses")
      .select("id")
      .eq("is_archived", true);
    return new Set((archivedRows ?? []).map((r) => r.id as string));
  };

  // Gezielter Email-Lookup
  const normEmail = normalizeEmail(candidate.email ?? null);
  if (normEmail) {
    const { data } = await db
      .from("leads")
      .select("id, crm_status_id, lifecycle_stage, deleted_at")
      .eq("email", normEmail)
      .limit(1)
      .maybeSingle();
    if (data) {
      const archivedSet = await buildArchivedSet();
      return {
        leadId: data.id as string,
        archived: isLeadArchived(
          {
            crm_status_id: (data.crm_status_id ?? null) as string | null,
            lifecycle_stage: (data.lifecycle_stage ?? null) as string | null,
            deleted_at: (data.deleted_at ?? null) as string | null,
          },
          archivedSet,
        ),
      };
    }
  }

  // Gezielter Phone-Lookup
  const normPhone = normalizePhone(candidate.phone ?? null);
  if (normPhone) {
    const { data } = await db
      .from("leads")
      .select("id, crm_status_id, lifecycle_stage, deleted_at")
      .eq("phone", normPhone)
      .limit(1)
      .maybeSingle();
    if (data) {
      const archivedSet = await buildArchivedSet();
      return {
        leadId: data.id as string,
        archived: isLeadArchived(
          {
            crm_status_id: (data.crm_status_id ?? null) as string | null,
            lifecycle_stage: (data.lifecycle_stage ?? null) as string | null,
            deleted_at: (data.deleted_at ?? null) as string | null,
          },
          archivedSet,
        ),
      };
    }
  }

  // Fallback: Vollindex + Fuzzy/Domain-Match (nicht strict).
  const index = await loadExistingLeadsIndex(db);
  return findDbDuplicateForLead(
    index,
    {
      company_name: candidate.company_name ?? null,
      website: candidate.website ?? null,
      city: candidate.city ?? null,
      email: candidate.email ?? null,
      phone: candidate.phone ?? null,
    },
    { strict: false },
  );
}
