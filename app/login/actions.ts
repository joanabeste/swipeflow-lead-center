"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** Prüft ob E-Mail registriert + aktiv ist */
async function checkProfile(email: string) {
  const db = createServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("id, status")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (!profile) {
    return { allowed: false, error: "Diese E-Mail-Adresse ist nicht registriert. Kontaktieren Sie einen Administrator." };
  }
  if (profile.status !== "active") {
    return { allowed: false, error: "Dieses Konto ist deaktiviert." };
  }
  return { allowed: true, error: undefined };
}

// ─── Magic Link ───

export async function sendMagicLink(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const email = formData.get("email") as string;
  if (!email) return { error: "Bitte geben Sie eine E-Mail-Adresse ein." };

  const check = await checkProfile(email);
  if (!check.allowed) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) return { error: "Magic Link konnte nicht gesendet werden. Bitte versuchen Sie es erneut." };
  return { success: true };
}

// ─── E-Mail + Passwort Login ───

export async function loginWithPassword(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben." };

  const check = await checkProfile(email);
  if (!check.allowed) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      return { error: "E-Mail oder Passwort falsch." };
    }
    if (error.message.includes("Email not confirmed")) {
      return { error: "E-Mail noch nicht bestätigt. Prüfen Sie Ihr Postfach." };
    }
    return { error: "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut." };
  }

  redirect("/");
}

// ─── Passwort vergessen ───

export async function sendPasswordReset(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const email = formData.get("email") as string;
  if (!email) return { error: "Bitte geben Sie eine E-Mail-Adresse ein." };

  const check = await checkProfile(email);
  if (!check.allowed) return { error: check.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?type=recovery`,
  });

  if (error) return { error: "Link konnte nicht gesendet werden. Bitte versuchen Sie es erneut." };
  return { success: true };
}

// ─── Neues Passwort setzen (nach Reset-Link) ───

export async function updatePassword(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!password || password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }
  if (password !== confirm) {
    return { error: "Passwörter stimmen nicht überein." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: "Passwort konnte nicht gesetzt werden. Bitte versuchen Sie es erneut." };
  return { success: true };
}

// ─── Logout ───

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
