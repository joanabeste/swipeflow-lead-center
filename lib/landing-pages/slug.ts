import { randomBytes } from "node:crypto";

// Base62-Alphabet (ohne Sonderzeichen, URL-safe). 8 Zeichen ≈ 2·10^14 Keyspace —
// unguessable, aber noch kurz genug für Copy-Paste in WhatsApp/E-Mail.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG_LENGTH = 8;

export function generateSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    // Modulo 62 ist leicht biased (256 % 62 ≠ 0). Für einen 8-Char-Link
    // ist die Verteilung aber für URL-Slugs irrelevant — Security-kritisch
    // ist allein der Keyspace, und der bleibt >> 10^14.
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
