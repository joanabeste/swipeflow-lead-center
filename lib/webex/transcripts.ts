// Webex-Transcripts-API-Client
//
// Webex liefert Transkripte über die /transcripts-API, wenn:
//  - der Meeting-Host/-Besitzer AI Assistant aktiviert hat, ODER
//  - die Call-Recording-Policy "Transcribe" setzt.
// Für Calling-Recordings ist das Transkript an das Recording-Meeting
// (meetingId = recording.meetingId) gekoppelt. Wenn AI Assistant nicht aktiv
// ist, liefert die API 403 oder einen leeren Items-Array — das fangen wir ab
// und markieren den Call mit `ai_assistant_not_enabled`.

import { getWebexToken } from "./auth";

const WEBEX_API_BASE = "https://webexapis.com/v1";

export type WebexTranscript = {
  id: string;
  meetingId: string;
  hostUserId?: string;
  meetingTopic?: string;
  vttDownloadLink?: string;
  txtDownloadLink?: string;
  status?: string;
};

export type TranscriptFetchResult =
  | {
      ok: true;
      transcriptId: string;
      text: string | null;
      vttUrl: string | null;
    }
  | { ok: false; error: string; errorCode: "ai_assistant_not_enabled" | "not_found" | "api_error" };

/**
 * Holt das erste Transkript für ein Recording. Voraussetzung: das Recording
 * hat eine meetingId (Webex Calling-Recordings der letzten 24 Monate haben
 * typischerweise eine).
 */
export async function fetchTranscriptForMeeting(meetingId: string): Promise<TranscriptFetchResult> {
  if (!meetingId) return { ok: false, error: "meetingId fehlt", errorCode: "not_found" };

  const token = await getWebexToken();
  const listUrl = `${WEBEX_API_BASE}/meetingTranscripts?meetingId=${encodeURIComponent(meetingId)}`;

  let listRes: Response;
  try {
    listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Webex nicht erreichbar", errorCode: "api_error" };
  }

  if (listRes.status === 403) {
    return {
      ok: false,
      error: "AI Assistant / Transkription nicht aktiv (403). In admin.webex.com → Services → Webex AI Assistant aktivieren.",
      errorCode: "ai_assistant_not_enabled",
    };
  }
  if (listRes.status === 404) {
    return { ok: false, error: "Kein Transkript für dieses Meeting gefunden", errorCode: "not_found" };
  }
  if (!listRes.ok) {
    const body = await listRes.text().catch(() => "");
    return { ok: false, error: `Webex /meetingTranscripts ${listRes.status}: ${body.slice(0, 200)}`, errorCode: "api_error" };
  }

  const listed = (await listRes.json().catch(() => ({ items: [] }))) as { items?: WebexTranscript[] };
  const first = listed.items?.[0];
  if (!first) {
    return { ok: false, error: "Noch kein Transkript verfügbar (wird in Webex verarbeitet)", errorCode: "not_found" };
  }

  const text = await downloadTranscriptText(first.id).catch(() => null);
  return {
    ok: true,
    transcriptId: first.id,
    text,
    vttUrl: first.vttDownloadLink ?? null,
  };
}

/** Lädt den Transkript-Text (txt-Format). */
async function downloadTranscriptText(transcriptId: string): Promise<string | null> {
  const token = await getWebexToken();
  const url = `${WEBEX_API_BASE}/meetingTranscripts/${encodeURIComponent(transcriptId)}/download?format=txt`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const txt = await res.text();
  return txt.trim().length > 0 ? txt : null;
}
