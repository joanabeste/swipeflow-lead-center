import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findDbDuplicateForLead,
  isLeadArchived,
  isFuzzyMatch,
  normalizeDomain,
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

export interface DuplicateCandidate {
  id: string;
  company_name: string | null;
  website: string | null;
  city: string | null;
  status: string | null;
}

interface CandidateRow {
  id: string;
  company_name: string | null;
  website: string | null;
  city: string | null;
  status: string | null;
  crm_status_id: string | null;
  lifecycle_stage: string | null;
  deleted_at: string | null;
}

const CANDIDATE_COLS =
  "id, company_name, website, city, status, email, phone, crm_status_id, lifecycle_stage, deleted_at";

/**
 * Findet ANDERE bestehende Leads, die mutmaßlich dieselbe Firma sind wie
 * `lead` — fuer die Duplikat-Warnung im CRM-Lead-Detail.
 *
 * Anders als `findExistingLeadForManual` (ein Treffer, fuer Neu-Anlage) liefert
 * dies eine LISTE und SCHLIESST den Lead selbst aus. Bewusst gezielte Queries
 * (exakte Domain/E-Mail/Telefon + Namens-ilike), damit der Aufruf auf dem
 * heissen Detail-Render-Pfad guenstig bleibt — kein Voll-Scan pro Aufruf.
 * Archivierte/aussortierte Leads werden gefiltert. Wird serverseitig pro
 * Seitenaufruf berechnet, also auch nach dem Anreichern frisch (z.B. wenn erst
 * dann die Domain bekannt wurde).
 */
export async function findLeadDuplicates(
  db: SupabaseClient,
  lead: {
    id: string;
    company_name?: string | null;
    website?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
  },
  limit = 10,
): Promise<DuplicateCandidate[]> {
  const byId = new Map<string, CandidateRow>();
  const collect = (rows: CandidateRow[] | null) => {
    for (const r of rows ?? []) byId.set(r.id, r);
  };

  // 1) Starke, exakte Signale (Domain / E-Mail / Telefon) in einer OR-Query.
  const orParts: string[] = [];
  const normEmail = normalizeEmail(lead.email ?? null);
  if (normEmail) orParts.push(`email.eq.${normEmail}`);
  const normPhone = normalizePhone(lead.phone ?? null);
  if (normPhone) orParts.push(`phone.eq.${normPhone}`);
  const domain = lead.website ? normalizeDomain(lead.website) : null;
  if (domain) orParts.push(`website.eq.${domain}`);
  if (orParts.length > 0) {
    const { data } = await db
      .from("leads")
      .select(CANDIDATE_COLS)
      .or(orParts.join(","))
      .neq("id", lead.id)
      .is("deleted_at", null)
      .limit(50);
    collect(data as CandidateRow[] | null);
  }

  // 2) Namens-Treffer: per ilike auf das erste echte Wort vorfiltern, dann
  //    mit dem Fuzzy-Matcher (gleiche Stadt oder unbekannt) bestaetigen.
  if (lead.company_name) {
    const rawToken = lead.company_name
      .trim()
      .split(/[\s\-,.]+/)
      .find((w) => w.length >= 3);
    if (rawToken) {
      const { data } = await db
        .from("leads")
        .select(CANDIDATE_COLS)
        .ilike("company_name", `%${rawToken}%`)
        .neq("id", lead.id)
        .is("deleted_at", null)
        .limit(50);
      for (const r of (data as CandidateRow[] | null) ?? []) {
        if (byId.has(r.id)) continue;
        const sameCity =
          !lead.city || !r.city || lead.city.toLowerCase() === r.city.toLowerCase();
        if (sameCity && r.company_name && isFuzzyMatch(lead.company_name, r.company_name)) {
          byId.set(r.id, r);
        }
      }
    }
  }

  if (byId.size === 0) return [];

  // Archivierte/aussortierte Leads ausschliessen (kein sinnvolles Merge-Ziel).
  const { data: archivedRows } = await db
    .from("custom_lead_statuses")
    .select("id")
    .eq("is_archived", true);
  const archivedSet = new Set((archivedRows ?? []).map((r) => r.id as string));

  const out: DuplicateCandidate[] = [];
  for (const r of byId.values()) {
    if (
      isLeadArchived(
        {
          lifecycle_stage: r.lifecycle_stage,
          deleted_at: r.deleted_at,
          crm_status_id: r.crm_status_id,
        },
        archivedSet,
      )
    ) {
      continue;
    }
    out.push({
      id: r.id,
      company_name: r.company_name,
      website: r.website,
      city: r.city,
      status: r.status,
    });
    if (out.length >= limit) break;
  }
  return out;
}
