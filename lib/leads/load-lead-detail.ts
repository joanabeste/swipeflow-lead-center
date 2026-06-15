import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Lead, LeadChange, LeadContact, LeadJobPosting, LeadEnrichment, CustomLeadStatus, LeadLink, LeadNote, LeadNoteWithDetails } from "@/lib/types";
import { getHqLocation, type HqLocation } from "@/lib/app-settings";
import { findLeadDuplicates, type DuplicateCandidate } from "@/lib/leads/find-existing";
import { getNoteAttachmentsForNotes } from "@/lib/notes/attachments";

export interface LeadDetailBundle {
  lead: Lead;
  changes: LeadChange[];
  contacts: LeadContact[];
  jobPostings: LeadJobPosting[];
  /** Notizen inkl. Autor + Anhänge — für die Notiz-Karte in der Neue-Leads-Ansicht. */
  notes: LeadNoteWithDetails[];
  latestEnrichment: LeadEnrichment | null;
  customStatuses: CustomLeadStatus[];
  hq: HqLocation;
  /** Mutmaßliche Duplikate dieses Leads — für das Warnbanner in der Neue-Leads-Ansicht. */
  duplicates: DuplicateCandidate[];
  /** Zusätzliche Webseiten/Profile (Facebook, Instagram, …). */
  links: LeadLink[];
}

/**
 * Laedt das vollstaendige Daten-Bundle fuer die Neue-Leads-Detailansicht.
 * Wird sowohl von der dedizierten Page (`/leads/[id]`) als auch vom
 * Preview-Drawer-Endpoint (`/api/leads/[id]/preview`) genutzt.
 *
 * Liefert null, wenn der Lead nicht existiert oder soft-deleted ist.
 *
 * Hot-path-Optimierung: Geocoding (Nominatim, bis zu 4 s) und das Signieren
 * der Screenshot-URL (Supabase-Storage-Roundtrip) sind **nicht** mehr Teil
 * dieser Funktion — beides wird vom Client lazy nachgezogen ueber
 * `/api/leads/[id]/geocode` bzw. `/api/leads/[id]/screenshot-url`.
 */
export async function loadLeadDetail(id: string): Promise<LeadDetailBundle | null> {
  const db = createServiceClient();

  const [
    { data: lead },
    { data: changes },
    { data: contacts },
    { data: jobPostings },
    { data: notes },
    { data: enrichments },
    { data: customStatuses },
    { data: links },
    hq,
  ] = await Promise.all([
    db.from("leads").select("*").eq("id", id).is("deleted_at", null).maybeSingle(),
    db.from("lead_changes").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("lead_contacts").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_job_postings").select("*").eq("lead_id", id).order("created_at"),
    db.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("lead_enrichments").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(1),
    db.from("custom_lead_statuses").select("*"),
    db.from("lead_links").select("*").eq("lead_id", id).order("created_at"),
    getHqLocation(),
  ]);

  if (!lead) return null;
  const typedLead = lead as Lead;

  // Autoren der Notizen auflösen — created_by verweist auf auth.users, nicht profiles.
  const notesRaw = (notes ?? []) as LeadNote[];
  const noteUserIds = new Set<string>();
  for (const n of notesRaw) if (n.created_by) noteUserIds.add(n.created_by);
  const { data: profileRows } = noteUserIds.size > 0
    ? await db.from("profiles").select("id, name, avatar_url").in("id", Array.from(noteUserIds))
    : { data: [] as { id: string; name: string; avatar_url: string | null }[] };
  const profileById = new Map<string, { name: string; avatar_url: string | null }>();
  for (const p of profileRows ?? []) {
    profileById.set(p.id as string, { name: p.name as string, avatar_url: (p.avatar_url as string | null) ?? null });
  }
  const attachmentsByNote = await getNoteAttachmentsForNotes(notesRaw.map((n) => n.id));
  const notesWithDetails: LeadNoteWithDetails[] = notesRaw.map((n) => ({
    ...n,
    profiles: n.created_by ? profileById.get(n.created_by) ?? null : null,
    attachments: attachmentsByNote.get(n.id) ?? [],
  }));

  // Mutmaßliche Duplikate (vollumfänglich: Domain/E-Mail/Telefon/Name, beide Seiten
  // normalisiert) — pro Aufruf frisch, also auch nach dem Anreichern.
  const duplicates = await findLeadDuplicates(db, {
    id: typedLead.id,
    company_name: typedLead.company_name,
    website: typedLead.website,
    email: typedLead.email,
    phone: typedLead.phone,
    city: typedLead.city,
  });

  return {
    lead: typedLead,
    changes: (changes as LeadChange[]) ?? [],
    contacts: (contacts as LeadContact[]) ?? [],
    jobPostings: (jobPostings as LeadJobPosting[]) ?? [],
    notes: notesWithDetails,
    latestEnrichment: (enrichments?.[0] as LeadEnrichment) ?? null,
    customStatuses: (customStatuses as CustomLeadStatus[]) ?? [],
    hq,
    duplicates,
    links: (links as LeadLink[]) ?? [],
  };
}
