import type { LeadNote, LeadCall } from "@/lib/types";

export type ActivityKind = "all" | "note" | "call" | "status" | "enrichment" | "change";

export type NoteRow = LeadNote & { profiles: { name: string } | null };
export type CallRow = LeadCall & { profiles: { name: string } | null };
export type AuditRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles: { name: string } | null;
};
