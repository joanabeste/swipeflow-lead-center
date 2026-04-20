import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { EmailTemplate } from "./templates";

// ─── CRUD (nur Server) ──────────────────────────────────────────

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
