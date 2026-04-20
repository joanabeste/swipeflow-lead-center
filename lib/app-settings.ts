import { createClient, createServiceClient } from "@/lib/supabase/server";

export interface HqLocation {
  lat: number;
  lng: number;
  label: string;
  address: string;
}

const FALLBACK_HQ: HqLocation = {
  lat: 52.38228,
  lng: 8.62305,
  label: "swipeflow GmbH",
  address: "Espelkamp",
};

/** Standort des eigenen Büros/HQ */
export async function getHqLocation(): Promise<HqLocation> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "hq_location")
      .single();
    const v = data?.value as Partial<HqLocation> | undefined;
    if (!v || typeof v.lat !== "number" || typeof v.lng !== "number") {
      return FALLBACK_HQ;
    }
    return {
      lat: v.lat,
      lng: v.lng,
      label: v.label ?? FALLBACK_HQ.label,
      address: v.address ?? FALLBACK_HQ.address,
    };
  } catch {
    return FALLBACK_HQ;
  }
}

/** HQ-Standort speichern (via Service-Client, Admin-Check beim Caller) */
export async function saveHqLocation(hq: HqLocation, userId: string | null): Promise<void> {
  const db = createServiceClient();
  await db.from("app_settings").upsert(
    {
      key: "hq_location",
      value: hq as unknown as Record<string, unknown>,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

// ─── Call-Queue-Einstellungen ──────────────────────────────────────────

export interface CallQueueSettings {
  /** Sekunden warten, bevor der Auto-Dialer den nächsten Lead anruft,
   *  wenn der Webhook keinen missed/failed-Status liefert. */
  ringTimeoutSeconds: number;
  /** Sekunden zwischen „Nicht erreicht" und dem nächsten Anruf-Start. */
  autoAdvanceDelaySeconds: number;
}

const FALLBACK_CALL_QUEUE: CallQueueSettings = {
  ringTimeoutSeconds: 25,
  autoAdvanceDelaySeconds: 3,
};

export async function getCallQueueSettings(): Promise<CallQueueSettings> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "call_queue")
      .single();
    const v = data?.value as Partial<CallQueueSettings> | undefined;
    return {
      ringTimeoutSeconds:
        typeof v?.ringTimeoutSeconds === "number" && v.ringTimeoutSeconds > 0
          ? Math.min(120, Math.max(5, Math.round(v.ringTimeoutSeconds)))
          : FALLBACK_CALL_QUEUE.ringTimeoutSeconds,
      autoAdvanceDelaySeconds:
        typeof v?.autoAdvanceDelaySeconds === "number" && v.autoAdvanceDelaySeconds >= 0
          ? Math.min(30, Math.max(0, Math.round(v.autoAdvanceDelaySeconds)))
          : FALLBACK_CALL_QUEUE.autoAdvanceDelaySeconds,
    };
  } catch {
    return FALLBACK_CALL_QUEUE;
  }
}

export async function saveCallQueueSettings(
  settings: CallQueueSettings,
  userId: string | null,
): Promise<void> {
  const db = createServiceClient();
  await db.from("app_settings").upsert(
    {
      key: "call_queue",
      value: settings as unknown as Record<string, unknown>,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}
