import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findDbDuplicateForLead,
  isLeadArchived,
  isFuzzyMatch,
  isDomainMatch,
  isGenericDomain,
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
  /** Welches Signal den Treffer ausgelöst hat — für eine klare Begründung im UI. */
  matchedOn: "domain" | "email" | "phone" | "name";
}

/**
 * Findet ALLE anderen bestehenden Leads, die mutmaßlich dieselbe Firma sind wie
 * `lead` — für die Duplikat-Warnung im CRM-Lead-Detail.
 *
 * Vollumfänglicher Check über DIESELBE Engine wie der Import-Dedup
 * (`loadExistingLeadsIndex` + Matching-Primitive): beide Seiten werden
 * normalisiert verglichen, daher robust gegen Format-Unterschiede —
 *   • Domain inkl. Sub-Domain (`isDomainMatch`, z.B. karriere.firma.de ↔ firma.de)
 *   • E-Mail (lowercase-normalisiert)
 *   • Telefonnummer (normalisiert: +49-Form, Leer-/Sonderzeichen entfernt — matcht
 *     also auch "0571 54683" gegen "+4957154683")
 *   • Firmenname (Fuzzy) bei gleicher/unbekannter Stadt
 * So warnt das CRM exakt vor dem, was auch der Import als Dublette werten würde.
 *
 * Schliesst den Lead selbst sowie archivierte/aussortierte Leads aus. Läuft
 * serverseitig pro Seitenaufruf — also auch nach dem Anreichern frisch, wenn
 * z.B. erst dann die Domain/Telefonnummer bekannt wurde.
 *
 * Kosten: lädt den Lead-Bestand (paginiert) wie die Merge-Seite. Bewusste
 * Entscheidung zugunsten Vollständigkeit statt eines gedeckelten Schnell-Checks.
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
  // Generische Domains (facebook.com …) zählen nicht als Identität → wie „keine Domain".
  const selfDomain = lead.website && !isGenericDomain(lead.website) ? normalizeDomain(lead.website) : null;
  const selfEmail = normalizeEmail(lead.email ?? null);
  const selfPhone = normalizePhone(lead.phone ?? null);
  const selfCity = lead.city?.toLowerCase() ?? null;
  const selfName = lead.company_name ?? null;

  // Kein Match-relevantes Feld → kein Check nötig.
  if (!selfDomain && !selfEmail && !selfPhone && !selfName) return [];

  const index = await loadExistingLeadsIndex(db);
  // Vom Nutzer als „kein Duplikat" bestätigte Paare ausblenden (beidseitig).
  const dismissed = await loadDismissedDuplicateIds(db, lead.id);

  const out: DuplicateCandidate[] = [];
  for (const c of index.existingLeads) {
    if (c.id === lead.id) continue;
    if (dismissed.has(c.id)) continue;
    if (isLeadArchived(c, index.archivedSet)) continue;

    let matchedOn: DuplicateCandidate["matchedOn"] | null = null;
    if (selfDomain && c.website && isDomainMatch(selfDomain, c.website)) {
      matchedOn = "domain";
    } else if (selfEmail && normalizeEmail(c.email) === selfEmail) {
      matchedOn = "email";
    } else if (selfPhone && normalizePhone(c.phone) === selfPhone) {
      matchedOn = "phone";
    } else if (selfName && c.company_name) {
      const sameCity = !selfCity || !c.city || selfCity === c.city.toLowerCase();
      if (sameCity && isFuzzyMatch(selfName, c.company_name)) matchedOn = "name";
    }
    if (!matchedOn) continue;

    out.push({
      id: c.id,
      company_name: c.company_name,
      website: c.website,
      city: c.city,
      matchedOn,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Lädt die IDs aller Leads, die mit `leadId` als „kein Duplikat" bestätigt wurden
 * (Tabelle lead_duplicate_dismissals, Paar kanonisch sortiert → beide Richtungen
 * prüfen). Resilient: existiert die Tabelle noch nicht (Migration 119 nicht
 * eingespielt), wird leer zurückgegeben, statt die Duplikat-Warnung zu brechen.
 */
async function loadDismissedDuplicateIds(
  db: SupabaseClient,
  leadId: string,
): Promise<Set<string>> {
  try {
    const { data, error } = await db
      .from("lead_duplicate_dismissals")
      .select("lead_id_a, lead_id_b")
      .or(`lead_id_a.eq.${leadId},lead_id_b.eq.${leadId}`);
    if (error) {
      console.error("[loadDismissedDuplicateIds]", error.message);
      return new Set();
    }
    const out = new Set<string>();
    for (const row of data ?? []) {
      out.add(row.lead_id_a === leadId ? (row.lead_id_b as string) : (row.lead_id_a as string));
    }
    return out;
  } catch (e) {
    console.error("[loadDismissedDuplicateIds] unerwartet:", e);
    return new Set();
  }
}
