// Vergleicht SMTP- und IMAP-Passwort eines Users (entschluesselt, nur Laenge/Hash zeigen).
import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const userEmail = process.argv[2];

function decryptSecret(encoded) {
  const key = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY, "base64");
  const [iv, tag, ct] = encoded.split(".").map((s) => Buffer.from(s, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: users } = await sb.auth.admin.listUsers();
const user = users.users.find((u) => u.email?.toLowerCase() === userEmail.toLowerCase());
if (!user) { console.error("user not found"); process.exit(1); }

const { data: row } = await sb
  .from("user_smtp_credentials")
  .select("username, password_encrypted, imap_username, imap_password_encrypted")
  .eq("user_id", user.id)
  .maybeSingle();

const smtpPass = decryptSecret(row.password_encrypted);
const imapPass = decryptSecret(row.imap_password_encrypted);

console.log("SMTP username:", row.username);
console.log("SMTP password length:", smtpPass.length, "sha256[:8]:", crypto.createHash("sha256").update(smtpPass).digest("hex").slice(0, 8));
console.log("IMAP username:", row.imap_username);
console.log("IMAP password length:", imapPass.length, "sha256[:8]:", crypto.createHash("sha256").update(imapPass).digest("hex").slice(0, 8));
console.log("Identisch?", smtpPass === imapPass);
