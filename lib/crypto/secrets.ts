// AES-256-GCM Verschlüsselung für Integrations-Tokens.
// Format: <iv-base64>.<auth-tag-base64>.<ciphertext-base64>
// Schlüssel: CREDENTIALS_ENCRYPTION_KEY (32 Byte, base64-kodiert).
// Generierung: openssl rand -base64 32

import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM Standard
const KEY_LEN = 32;

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY fehlt. Erzeuge mit `openssl rand -base64 32` und setze als Vercel-Env-Var.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LEN) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY hat ${key.length} Bytes, erwartet ${KEY_LEN}. Muss base64-kodierter 32-Byte-Schlüssel sein.`,
    );
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(encoded: string): string {
  const key = getKey();
  const parts = encoded.split(".");
  if (parts.length !== 3) {
    throw new Error("Ungültiges Ciphertext-Format (erwartet iv.tag.cipher, base64).");
  }
  const [ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(cipherB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}
