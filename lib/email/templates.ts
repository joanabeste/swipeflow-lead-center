/**
 * Client-safe Template-Utilities. Reine Logik ohne DB-Zugriff — darf
 * von Server- und Client-Komponenten importiert werden.
 *
 * Für DB-CRUD siehe `lib/email/templates-server.ts`.
 */

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
