"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

type Result = { success: true; id: string } | { error: string };

export async function createCustomer(input: {
  company_name: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  vertical?: "webdesign" | "recruiting";
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
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
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

  await logAudit({ userId: user.id, action: "customer.create_manual", entityType: "lead", entityId: data.id });
  revalidatePath("/fulfillment/kunden");
  return { success: true, id: data.id };
}

export async function createCustomerAndRedirect(formData: FormData) {
  const res = await createCustomer({
    company_name: String(formData.get("company_name") ?? ""),
    email: String(formData.get("email") ?? "") || undefined,
    phone: String(formData.get("phone") ?? "") || undefined,
    website: String(formData.get("website") ?? "") || undefined,
    city: String(formData.get("city") ?? "") || undefined,
    vertical: (formData.get("vertical") as "webdesign" | "recruiting") || undefined,
  });
  if ("error" in res) throw new Error(res.error);
  redirect(`/fulfillment/kunden/${res.id}`);
}
