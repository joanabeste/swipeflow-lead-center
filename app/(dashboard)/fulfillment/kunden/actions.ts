"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

type Result = { success: true; id: string } | { error: string };

export interface PrimaryContactInput {
  first_name: string;
  last_name?: string;
  salutation?: "du" | "sie";
  role?: string;
  email?: string;
  phone?: string;
}

export async function createCustomer(input: {
  company_name: string;
  website?: string;
  city?: string;
  vertical?: "webdesign" | "recruiting" | "sonstiges";
  primaryContact?: PrimaryContactInput | null;
}): Promise<Result> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (!input.company_name?.trim()) return { error: "Firmenname fehlt." };

  const db = createServiceClient();
  const { data, error } = await db
    .from("leads")
    .insert({
      company_name: input.company_name.trim(),
      website: input.website?.trim() || null,
      city: input.city?.trim() || null,
      vertical: input.vertical ?? null,
      source_type: "manual",
      status: "imported",
      lifecycle_stage: "customer",
      became_customer_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[createCustomer]", error);
    if (error.code === "42P01" || /column.*does not exist/i.test(error.message)) {
      return { error: "Fulfillment-Modul nicht migriert (071 fehlt)." };
    }
    return { error: `DB-Fehler: ${error.message}` };
  }

  const leadId = data.id as string;

  // Optional: primären Ansprechpartner mit anlegen.
  const pc = input.primaryContact;
  if (pc && pc.first_name.trim()) {
    const { error: contactErr } = await db.from("customer_contacts").insert({
      lead_id: leadId,
      first_name: pc.first_name.trim(),
      last_name: pc.last_name?.trim() || null,
      salutation: pc.salutation ?? "sie",
      role: pc.role?.trim() || null,
      email: pc.email?.trim() || null,
      phone: pc.phone?.trim() || null,
      is_primary: true,
      created_by: user.id,
    });
    if (contactErr) {
      console.error("[createCustomer:primaryContact]", contactErr);
      // Kunde steht bereits — Kontakt-Fehler nicht zurückgeben, nur loggen.
    }
  }

  await logAudit({ userId: user.id, action: "customer.create_manual", entityType: "lead", entityId: leadId });
  revalidatePath("/fulfillment/kunden");
  return { success: true, id: leadId };
}

export interface UpdateCustomerInput {
  company_name?: string;
  website?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
}

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput): Promise<{ success: true } | { error: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };
  if (input.company_name !== undefined && !input.company_name.trim()) {
    return { error: "Firmenname darf nicht leer sein." };
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.company_name !== undefined) patch.company_name = input.company_name.trim();
  if (input.website !== undefined) patch.website = clean(input.website);
  if (input.street !== undefined) patch.street = clean(input.street);
  if (input.zip !== undefined) patch.zip = clean(input.zip);
  if (input.city !== undefined) patch.city = clean(input.city);

  const db = createServiceClient();
  const { error } = await db.from("leads").update(patch).eq("id", id);
  if (error) {
    console.error("[updateCustomer]", error);
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id, action: "customer.update", entityType: "lead", entityId: id,
    details: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
  });
  revalidatePath(`/fulfillment/kunden/${id}`);
  revalidatePath("/fulfillment/kunden");
  return { success: true };
}

export async function deleteCustomer(id: string): Promise<{ success: true } | { error: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const db = createServiceClient();

  const { data: lead, error: leadErr } = await db
    .from("leads")
    .select("id, company_name, lifecycle_stage")
    .eq("id", id)
    .maybeSingle<{ id: string; company_name: string; lifecycle_stage: string | null }>();
  if (leadErr) {
    console.error("[deleteCustomer:load]", leadErr);
    return { error: `DB-Fehler: ${leadErr.message}` };
  }
  if (!lead) return { error: "Kunde nicht gefunden." };

  const { count: activeCount, error: actErr } = await db
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", id)
    .neq("status", "completed");
  if (actErr && actErr.code !== "42P01") {
    console.error("[deleteCustomer:projects]", actErr);
    return { error: `DB-Fehler: ${actErr.message}` };
  }
  if ((activeCount ?? 0) > 0) {
    return { error: "Kunde hat noch aktive Projekte. Erst diese löschen oder abschließen." };
  }

  await db.from("projects").delete().eq("lead_id", id);
  await db.from("customer_contacts").delete().eq("lead_id", id);

  const { error } = await db.from("leads").delete().eq("id", id);
  if (error) {
    console.error("[deleteCustomer]", error);
    return { error: `DB-Fehler: ${error.message}` };
  }

  await logAudit({
    userId: user.id, action: "customer.delete", entityType: "lead", entityId: id,
    details: { company_name: lead.company_name },
  });
  revalidatePath("/fulfillment/kunden");
  revalidatePath("/fulfillment/projekte");
  return { success: true };
}

export async function createCustomerAndRedirect(formData: FormData) {
  const res = await createCustomer({
    company_name: String(formData.get("company_name") ?? ""),
    website: String(formData.get("website") ?? "") || undefined,
    city: String(formData.get("city") ?? "") || undefined,
    vertical: (formData.get("vertical") as "webdesign" | "recruiting" | "sonstiges") || undefined,
  });
  if ("error" in res) throw new Error(res.error);
  redirect(`/fulfillment/kunden/${res.id}`);
}
