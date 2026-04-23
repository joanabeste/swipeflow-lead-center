import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** URL-safe Slug aus einem Firmennamen: Umlaute ersetzen, alles nicht-[a-z0-9] → "-". */
export function slugifyCompanyName(name: string): string {
  const map: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
  const normalized = name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => map[c] ?? c)
    // Akzente etc. zerlegen und die Marks entfernen (z. B. é → e).
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug;
}

/** 4-Zeichen Suffix aus Base36 für Kollisions-Auflösung bei gleichen Firmennamen. */
export function randomSuffix(length = 4): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Fallback wenn der Firmenname keinen gültigen Slug ergibt (z. B. nur Sonderzeichen). */
export function generateSlug(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
