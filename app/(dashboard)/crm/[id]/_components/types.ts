import type { LeadCall, EmailMessage, LeadNoteWithDetails, NoteAuthorProfile } from "@/lib/types";

export type ActivityKind = "all" | "note" | "call" | "email" | "status" | "enrichment" | "change" | "import" | "appointment";

// In lib/types definiert (server-/client-neutral), hier re-exportiert für die Feed-Komponenten.
export type { LeadImportInfo } from "@/lib/types";

export type AuthorProfile = NoteAuthorProfile;

export type NoteRow = LeadNoteWithDetails;
export type CallRow = LeadCall & { profiles: AuthorProfile | null };
export type EmailRow = EmailMessage & {
  profiles: AuthorProfile | null;
  contact_name: string | null;
};
export type AuditRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles: AuthorProfile | null;
};
