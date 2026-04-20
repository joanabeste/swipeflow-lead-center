import type { LeadNote, LeadCall, EmailMessage } from "@/lib/types";

export type ActivityKind = "all" | "note" | "call" | "email" | "status" | "enrichment" | "change";

export interface AuthorProfile { name: string; avatar_url: string | null }

export type NoteRow = LeadNote & { profiles: AuthorProfile | null };
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
