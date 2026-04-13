"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function sendMagicLink(
  prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const supabase = await createClient();
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Bitte geben Sie eine E-Mail-Adresse ein." };
  }

  // Prüfen ob ein Profil mit dieser E-Mail existiert
  const db = createServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, status")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (!profile) {
    return { error: "Diese E-Mail-Adresse ist nicht registriert. Kontaktieren Sie einen Administrator." };
  }

  if (profile.status !== "active") {
    return { error: "Dieses Konto ist deaktiviert." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return { error: "Magic Link konnte nicht gesendet werden. Bitte versuchen Sie es erneut." };
  }

  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
