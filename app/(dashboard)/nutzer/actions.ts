"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit-log";

export async function createUser(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // Admin-Check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", currentUser!.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Nur Administratoren können Nutzer anlegen." };
  }

  const email = formData.get("email") as string;
  const name = formData.get("name") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;

  if (!email || !name || !password || !role) {
    return { error: "Alle Felder sind Pflichtfelder." };
  }

  // Nutzer über Admin-API erstellen
  const { data: newUser, error: createError } =
    await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError) return { error: createError.message };

  // Profil erstellen
  const { error: profileError } = await serviceClient
    .from("profiles")
    .insert({
      id: newUser.user.id,
      email,
      name,
      role,
      status: "active",
    });

  if (profileError) return { error: profileError.message };

  await logAudit({
    userId: currentUser?.id ?? null,
    action: "user.created",
    entityType: "profile",
    entityId: newUser.user.id,
    details: { email, role },
  });

  revalidatePath("/nutzer");
  return { success: true } as { error?: string; success?: boolean };
}

export async function updateUser(
  userId: string,
  updates: { name?: string; role?: string; status?: string },
) {
  const supabase = await createClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: error.message };

  await logAudit({
    userId: currentUser?.id ?? null,
    action: "user.updated",
    entityType: "profile",
    entityId: userId,
    details: updates,
  });

  revalidatePath("/nutzer");
  return { success: true };
}

export async function deleteUser(userId: string) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  if (currentUser?.id === userId) {
    return { error: "Sie können sich nicht selbst löschen." };
  }

  await serviceClient.auth.admin.deleteUser(userId);
  await serviceClient.from("profiles").delete().eq("id", userId);

  await logAudit({
    userId: currentUser?.id ?? null,
    action: "user.deleted",
    entityType: "profile",
    entityId: userId,
  });

  revalidatePath("/nutzer");
  return { success: true };
}

export async function resetPassword(userId: string, newPassword: string) {
  const serviceClient = createServiceClient();

  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) return { error: error.message };

  return { success: true };
}
