import { createServiceClient } from "@/lib/supabase/server";

export interface EmailTemplate {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Built-in-Variablen werden beim Rendern automatisch befüllt. */
export const BUILT_IN_VARIABLES = [
  "contact_name",
  "contact_first_name",
  "contact_role",
  "company_name",
  "sender_name",
] as const;

export type BuiltInVariable = (typeof BUILT_IN_VARIABLES)[number];

/** Findet alle `{{name}}`-Vorkommen in einem String. */
export function extractVariables(text: string): string[] {
  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

/** Ersetzt `{{name}}` mit Werten aus `context`. Unbekannte Variablen bleiben literal stehen. */
export function renderTemplate(text: string, context: Record<string, string | undefined>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, name: string) => {
    const v = context[name];
    return v !== undefined && v !== "" ? v : `{{${name}}}`;
  });
}

/** Baut den Built-in-Context aus Kontakt + Absender. */
export function buildBuiltInContext(input: {
  contactName: string | null;
  contactRole: string | null;
  companyName: string;
  senderName: string | null;
}): Record<BuiltInVariable, string> {
  const fullName = (input.contactName ?? "").trim();
  const firstName = fullName.split(/\s+/)[0] ?? "";
  return {
    contact_name: fullName,
    contact_first_name: firstName,
    contact_role: input.contactRole ?? "",
    company_name: input.companyName,
    sender_name: (input.senderName ?? "").trim(),
  };
}

// ─── CRUD ──────────────────────────────────────────────────────

export async function listTemplates(userId: string): Promise<EmailTemplate[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("email_templates")
    .select("id, user_id, name, subject, body, created_at, updated_at")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  return (data ?? []).map(mapRow);
}

export async function getTemplate(id: string, userId: string): Promise<EmailTemplate | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("email_templates")
    .select("id, user_id, name, subject, body, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

export async function createTemplate(
  userId: string,
  input: { name: string; subject: string; body: string },
): Promise<void> {
  const db = createServiceClient();
  await db.from("email_templates").insert({
    user_id: userId,
    name: input.name,
    subject: input.subject,
    body: input.body,
  });
}

export async function updateTemplate(
  id: string,
  userId: string,
  input: { name: string; subject: string; body: string },
): Promise<void> {
  const db = createServiceClient();
  await db
    .from("email_templates")
    .update({
      name: input.name,
      subject: input.subject,
      body: input.body,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
}

export async function deleteTemplate(id: string, userId: string): Promise<void> {
  const db = createServiceClient();
  await db.from("email_templates").delete().eq("id", id).eq("user_id", userId);
}

function mapRow(row: Record<string, unknown>): EmailTemplate {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    subject: row.subject as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
