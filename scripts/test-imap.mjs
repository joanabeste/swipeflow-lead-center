// Debug-Script: laedt verschluesselte IMAP-Creds eines Users aus Supabase,
// entschluesselt sie und versucht eine ImapFlow-Verbindung mit Verbose-Logging.
// Aufruf:  node scripts/test-imap.mjs joanabeste@gmail.com
// (Email des Lead-Center-Users, nicht die IMAP-Mailadresse.)

import { readFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";

// .env.local manuell laden falls dotenv das nicht tut
if (existsSync(".env.local")) {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const userEmail = process.argv[2];
if (!userEmail) {
  console.error("Usage: node scripts/test-imap.mjs <lead-center-user-email>");
  process.exit(1);
}

const KEY_LEN = 32;
const ALGO = "aes-256-gcm";

function decryptSecret(encoded) {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY missing");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LEN) throw new Error(`Key length ${key.length}, expected ${KEY_LEN}`);
  const [ivB64, tagB64, cipherB64] = encoded.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(cipherB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Lead-Center-User finden
const { data: users } = await sb.auth.admin.listUsers();
const user = users.users.find((u) => u.email?.toLowerCase() === userEmail.toLowerCase());
if (!user) {
  console.error(`User ${userEmail} not found.`);
  process.exit(1);
}
console.log(`User: ${user.email} (${user.id})`);

const { data: cred, error } = await sb
  .from("user_smtp_credentials")
  .select("imap_host, imap_port, imap_secure, imap_username, imap_password_encrypted, imap_sent_folder, imap_last_sync_error")
  .eq("user_id", user.id)
  .maybeSingle();
if (error || !cred) {
  console.error("No credentials:", error);
  process.exit(1);
}
if (!cred.imap_password_encrypted) {
  console.error("No imap_password_encrypted stored.");
  process.exit(1);
}

let password;
try {
  password = decryptSecret(cred.imap_password_encrypted);
} catch (e) {
  console.error("Decrypt failed:", e.message);
  process.exit(1);
}

const charCodes = [...password].slice(0, 5).map((c) => c.charCodeAt(0));
console.log("\nIMAP config:");
console.log("  host:", cred.imap_host);
console.log("  port:", cred.imap_port);
console.log("  secure:", cred.imap_secure);
console.log("  username:", JSON.stringify(cred.imap_username));
console.log("  password length:", password.length);
console.log("  password first 5 char codes:", charCodes);
console.log("  password contains whitespace?", /\s/.test(password));
console.log("  sent folder:", cred.imap_sent_folder);
console.log("  last_sync_error:", cred.imap_last_sync_error);

console.log("\n--- Connecting (verbose) ---");
const client = new ImapFlow({
  host: cred.imap_host,
  port: cred.imap_port,
  secure: cred.imap_secure,
  auth: { user: cred.imap_username, pass: password },
  logger: {
    debug: (o) => console.log("DEBUG", o),
    info: (o) => console.log("INFO", o),
    warn: (o) => console.log("WARN", o),
    error: (o) => console.log("ERROR", o),
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
});

try {
  await client.connect();
  console.log("\n✓ Connected!");
  const folders = await client.list();
  console.log("Folders:", folders.map((f) => f.path));
  await client.logout();
} catch (e) {
  console.log("\n✗ Failed:");
  console.log("  message:", e?.message);
  console.log("  responseStatus:", e?.responseStatus);
  console.log("  authenticationFailed:", e?.authenticationFailed);
  console.log("  response:", e?.response);
  try { await client.close(); } catch {}
  process.exit(1);
}
