// Webex-Calling-Recordings-API-Client
//
// Token-Source: siehe lib/webex/auth.ts (DB verschlüsselt + ENV-Fallback).

import type { WebexRecording } from "./types";
import { getWebexToken, getWebexCredentials } from "./auth";

const WEBEX_API_BASE = "https://webexapis.com/v1";

export async function isWebexConfigured(): Promise<boolean> {
  return (await getWebexCredentials()) !== null;
}

/**
 * Listet Call-Recordings des Accounts für einen Zeitraum. Webex paginiert;
 * wir folgen dem `Link`-Header max. 10 Seiten (ausreichend für 2-min-Sync).
 */
export async function listRecordings(input: {
  from: Date;
  to: Date;
  max?: number;
}): Promise<WebexRecording[]> {
  const token = await getWebexToken();
  const max = Math.min(input.max ?? 100, 100);
  const params = new URLSearchParams({
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    max: String(max),
  });

  const collected: WebexRecording[] = [];
  let url: string | null = `${WEBEX_API_BASE}/admin/callingRecordings?${params.toString()}`;
  let pages = 0;

  while (url && pages < 10) {
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 401) throw new Error("Webex-Token ungültig/abgelaufen (401) — neues PAT in developer.webex.com generieren.");
    if (res.status === 403) throw new Error("Webex-Token hat nicht die nötigen Scopes (403) — spark-admin:callingRecordings_read + _download nötig.");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Webex API ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as { items?: WebexRecording[] };
    if (Array.isArray(data.items)) collected.push(...data.items);

    const link: string | null = res.headers.get("link");
    const nextMatch = link?.match(/<([^>]+)>;\s*rel="next"/i);
    url = nextMatch ? nextMatch[1] : null;
    pages++;
  }

  return collected;
}

/**
 * Fordert eine frische signierte Download-URL für ein Recording an.
 */
export async function getRecordingDownloadUrl(recordingId: string): Promise<string | null> {
  const token = await getWebexToken();
  const res = await fetch(`${WEBEX_API_BASE}/admin/callingRecordings/${encodeURIComponent(recordingId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webex /admin/callingRecordings/${recordingId} — ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as WebexRecording;
  return data.downloadUrl ?? null;
}

/** Normalisiert eine Telefonnummer zu Ziffern ohne Prefix/Formatierung. */
export function normalizeNumber(n: string | null | undefined): string {
  if (!n) return "";
  return n.replace(/[^0-9]/g, "").replace(/^0+/, "");
}
