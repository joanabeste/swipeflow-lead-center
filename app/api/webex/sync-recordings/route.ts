import { createServiceClient } from "@/lib/supabase/server";
import { listRecordings, normalizeNumber, isWebexConfigured } from "@/lib/webex/recordings";
import { fetchTranscriptForMeeting } from "@/lib/webex/transcripts";
import { markVerifyError } from "@/lib/webex/auth";

export const maxDuration = 60;

/**
 * Zwei Pässe pro Aufruf:
 *   (1) Recording-Sync — matched Webex-Recordings auf lead_calls (24h-Fenster).
 *   (2) Transcript-Sync — holt Transkripte für bereits gematchte Recordings.
 *
 * Getriggert von Vercel Cron (Bearer `CRON_SECRET`) oder manuellem Admin-Button.
 */
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await isWebexConfigured())) {
    return Response.json(
      { error: "Webex-Token fehlt — in den Einstellungen hinterlegen oder WEBEX_CALLING_TOKEN setzen." },
      { status: 503 },
    );
  }

  const recordingResult = await syncRecordings();
  const transcriptResult = await syncTranscripts();

  return Response.json({
    recordings: recordingResult,
    transcripts: transcriptResult,
    // Backwards-compat für den Admin-Button (zeigt matched/checked aus recordings):
    checked: recordingResult.checked,
    matched: recordingResult.matched,
  });
}

async function syncRecordings() {
  const db = createServiceClient();
  const now = Date.now();
  const windowStart = new Date(now - 24 * 3600_000).toISOString();
  const retryBefore = new Date(now - 5 * 60_000).toISOString();
  const waitAfterEndMs = 90_000;

  const { data: pending, error: pendErr } = await db
    .from("lead_calls")
    .select("id, lead_id, phone_number, direction, started_at, ended_at, recording_fetch_attempted_at")
    .is("recording_url", null)
    .not("ended_at", "is", null)
    .gte("started_at", windowStart)
    .or(`recording_fetch_attempted_at.is.null,recording_fetch_attempted_at.lt.${retryBefore}`)
    .limit(200);
  if (pendErr) {
    console.error("[webex-sync] recordings DB-Query:", pendErr);
    return { error: pendErr.message, checked: 0, matched: 0 };
  }
  if (!pending || pending.length === 0) {
    return { checked: 0, matched: 0 };
  }

  const ready = pending.filter((c) => {
    if (!c.ended_at) return false;
    return new Date(c.ended_at).getTime() + waitAfterEndMs <= now;
  });
  if (ready.length === 0) {
    return { checked: pending.length, matched: 0, note: "Alle Kandidaten noch im 90s-Warteslot" };
  }

  const minStart = new Date(Math.min(...ready.map((c) => new Date(c.started_at).getTime())) - 10 * 60_000);
  const maxEnd = new Date(Math.max(...ready.map((c) => new Date(c.ended_at!).getTime())) + 10 * 60_000);

  let recordings: Awaited<ReturnType<typeof listRecordings>>;
  try {
    recordings = await listRecordings({ from: minStart, to: maxEnd });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webex-Fehler";
    console.error("[webex-sync] listRecordings failed:", msg);
    await markVerifyError(msg);
    await db
      .from("lead_calls")
      .update({
        recording_fetch_attempted_at: new Date().toISOString(),
        recording_fetch_error: msg.slice(0, 500),
      })
      .in(
        "id",
        ready.map((c) => c.id),
      );
    return { error: msg, checked: ready.length, matched: 0 };
  }

  let matched = 0;
  const fiveMin = 5 * 60_000;
  const attemptedAt = new Date().toISOString();

  for (const call of ready) {
    const callStart = new Date(call.started_at).getTime();
    const callNum = normalizeNumber(call.phone_number);
    const match = recordings.find((r) => {
      const recStart = new Date(r.startTime).getTime();
      if (Math.abs(recStart - callStart) > fiveMin) return false;
      if (!callNum) return false;
      const recDest = normalizeNumber(
        call.direction === "outbound" ? r.destinationNumber : r.callerNumber,
      );
      return recDest && recDest === callNum;
    });

    if (match) {
      await db
        .from("lead_calls")
        .update({
          recording_url: match.downloadUrl ?? null,
          recording_id: match.id,
          recording_fetched_at: attemptedAt,
          recording_fetch_attempted_at: attemptedAt,
          recording_fetch_error: null,
          updated_at: attemptedAt,
        })
        .eq("id", call.id);
      matched++;
    } else {
      await db
        .from("lead_calls")
        .update({ recording_fetch_attempted_at: attemptedAt })
        .eq("id", call.id);
    }
  }

  console.log(`[webex-sync] recordings: candidates=${ready.length} matched=${matched} window=${recordings.length}`);
  return { checked: ready.length, matched, recordings_in_window: recordings.length };
}

async function syncTranscripts() {
  const db = createServiceClient();
  const now = Date.now();
  const retryBefore = new Date(now - 5 * 60_000).toISOString();

  // Recording vorhanden, Transkript fehlt, letzter Versuch > 5min (oder nie).
  const { data: pending, error: pendErr } = await db
    .from("lead_calls")
    .select("id, recording_id, transcript_fetch_attempted_at")
    .is("transcript_id", null)
    .not("recording_url", "is", null)
    .or(`transcript_fetch_attempted_at.is.null,transcript_fetch_attempted_at.lt.${retryBefore}`)
    .limit(50);
  if (pendErr) {
    console.error("[webex-sync] transcripts DB-Query:", pendErr);
    return { error: pendErr.message, checked: 0, matched: 0 };
  }
  if (!pending || pending.length === 0) return { checked: 0, matched: 0 };

  let matched = 0;
  for (const call of pending) {
    const attemptedAt = new Date().toISOString();
    // Webex-Recordings tragen die meetingId identisch zur recording_id
    // (Meeting-verknüpfte Calls). Wenn das API-Antwort-Mapping abweicht,
    // wird einfach "not_found" zurückgegeben — Retry ist eingebaut.
    const meetingId = call.recording_id ?? "";
    const res = await fetchTranscriptForMeeting(meetingId);
    if (res.ok) {
      await db
        .from("lead_calls")
        .update({
          transcript_id: res.transcriptId,
          transcript_text: res.text,
          transcript_vtt_url: res.vttUrl,
          transcript_fetched_at: attemptedAt,
          transcript_fetch_attempted_at: attemptedAt,
          transcript_fetch_error: null,
          updated_at: attemptedAt,
        })
        .eq("id", call.id);
      matched++;
    } else {
      await db
        .from("lead_calls")
        .update({
          transcript_fetch_attempted_at: attemptedAt,
          transcript_fetch_error: res.error.slice(0, 500),
        })
        .eq("id", call.id);
    }
  }
  console.log(`[webex-sync] transcripts: candidates=${pending.length} matched=${matched}`);
  return { checked: pending.length, matched };
}

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.WEBEX_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
}
