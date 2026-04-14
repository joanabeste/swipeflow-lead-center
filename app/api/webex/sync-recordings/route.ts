import { createServiceClient } from "@/lib/supabase/server";
import { listRecordings, normalizeNumber, isWebexConfigured } from "@/lib/webex/recordings";

export const maxDuration = 60;

/**
 * Holt alle noch nicht synchronisierten Call-Recordings aus Webex und
 * ordnet sie den passenden lead_calls-Einträgen zu.
 *
 * Getriggert von:
 * - Vercel Cron (authentifiziert per CRON_SECRET)
 * - Manueller Button im Settings (authentifiziert per Admin-Session)
 *
 * Matching:
 * - |recording.startTime − call.started_at| < 5 min
 * - normalisierte Nummer identisch (outbound: destinationNumber == phone_number)
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
  if (!isWebexConfigured()) {
    return Response.json({ error: "WEBEX_CALLING_TOKEN fehlt — in Vercel-Env setzen." }, { status: 503 });
  }

  const db = createServiceClient();
  const now = Date.now();
  const windowStart = new Date(now - 24 * 3600_000).toISOString();
  const retryBefore = new Date(now - 5 * 60_000).toISOString(); // erneut versuchen nach 5 min
  const waitAfterEndMs = 90_000; // 90 s warten, bis Webex die Aufzeichnung bereithält

  // Kandidaten: Calls der letzten 24h, beendet, noch ohne recording_url,
  // letzter Versuch vor mindestens 5 min (oder noch nie).
  const { data: pending, error: pendErr } = await db
    .from("lead_calls")
    .select("id, lead_id, phone_number, direction, started_at, ended_at, recording_fetch_attempted_at")
    .is("recording_url", null)
    .not("ended_at", "is", null)
    .gte("started_at", windowStart)
    .or(`recording_fetch_attempted_at.is.null,recording_fetch_attempted_at.lt.${retryBefore}`)
    .limit(200);
  if (pendErr) {
    console.error("[webex-sync] DB-Query-Fehler:", pendErr);
    return Response.json({ error: pendErr.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return Response.json({ checked: 0, matched: 0 });
  }

  // Filter: ended_at + 90s noch nicht erreicht → überspringen (Webex hat noch nicht verarbeitet)
  const ready = pending.filter((c) => {
    if (!c.ended_at) return false;
    return new Date(c.ended_at).getTime() + waitAfterEndMs <= now;
  });

  if (ready.length === 0) {
    return Response.json({ checked: pending.length, matched: 0, note: "Alle Kandidaten noch im 90s-Warteslot" });
  }

  // Zeitfenster für die Webex-Abfrage: ältester Kandidat bis jüngster + Puffer
  const minStart = new Date(Math.min(...ready.map((c) => new Date(c.started_at).getTime())) - 10 * 60_000);
  const maxEnd = new Date(Math.max(...ready.map((c) => new Date(c.ended_at!).getTime())) + 10 * 60_000);

  let recordings: Awaited<ReturnType<typeof listRecordings>>;
  try {
    recordings = await listRecordings({ from: minStart, to: maxEnd });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webex-Fehler";
    console.error("[webex-sync] listRecordings failed:", msg);
    // Alle Kandidaten als "versucht" markieren, aber mit Fehler
    await db.from("lead_calls").update({
      recording_fetch_attempted_at: new Date().toISOString(),
      recording_fetch_error: msg.slice(0, 500),
    }).in("id", ready.map((c) => c.id));
    return Response.json({ error: msg }, { status: 502 });
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
      await db.from("lead_calls").update({
        recording_url: match.downloadUrl ?? null,
        recording_id: match.id,
        recording_fetched_at: attemptedAt,
        recording_fetch_attempted_at: attemptedAt,
        recording_fetch_error: null,
        updated_at: attemptedAt,
      }).eq("id", call.id);
      matched++;
    } else {
      await db.from("lead_calls").update({
        recording_fetch_attempted_at: attemptedAt,
      }).eq("id", call.id);
    }
  }

  console.log(`[webex-sync] Kandidaten ${ready.length}, gematched ${matched}, Recordings im Fenster ${recordings.length}`);
  return Response.json({
    checked: ready.length,
    recordings_in_window: recordings.length,
    matched,
  });
}

function authorized(request: Request): boolean {
  // Vercel Cron sendet diesen Header automatisch
  const header = request.headers.get("authorization") ?? "";
  const expected = process.env.WEBEX_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!expected) return false;
  return header === `Bearer ${expected}`;
}
