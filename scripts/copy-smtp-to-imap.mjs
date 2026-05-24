// One-off: kopiert SMTP-Passwort -> IMAP-Passwort fuer einen User
// (gleiches encrypted Blob copy & paste — kein Re-Encrypt noetig).
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const userEmail = process.argv[2];
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: users } = await sb.auth.admin.listUsers();
const user = users.users.find((u) => u.email?.toLowerCase() === userEmail.toLowerCase());
if (!user) { console.error("user not found"); process.exit(1); }

const { data: row } = await sb
  .from("user_smtp_credentials")
  .select("password_encrypted")
  .eq("user_id", user.id)
  .maybeSingle();
if (!row?.password_encrypted) { console.error("no smtp password stored"); process.exit(1); }

const { error } = await sb
  .from("user_smtp_credentials")
  .update({ imap_password_encrypted: row.password_encrypted, imap_last_sync_error: null })
  .eq("user_id", user.id);
if (error) { console.error(error); process.exit(1); }
console.log("OK — IMAP-Passwort = SMTP-Passwort fuer", userEmail);
