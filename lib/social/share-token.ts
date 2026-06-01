// Reine Token-/Link-Helfer (kein server-only, keine DB) — unabhängig testbar.

import crypto from "node:crypto";

/** Erzeugt ein nicht-erratbares Freigabe-Token (256 bit, URL-sicher). */
export function generateShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Baut den absoluten, öffentlichen Kunden-Freigabelink (/freigabe/<token>).
 *  Nutzt dieselbe Env-Konvention wie buildContractLink. */
export function buildShareLink(token: string): string {
  const base = (process.env.APP_BASE_URL ?? process.env.CONTRACT_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/freigabe/${token}`;
}
