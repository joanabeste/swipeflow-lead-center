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

// ─── Qualifizierungs-Cockpit: Tasten-1-Verhalten ───────────────────────
// Diese Einstellung wird PRO NUTZER gespeichert: jeder Eintrag liegt unter dem
// Key `qualify_hotkey:<userId>` (app_settings.key ist freier Text-PK), sodass
// das Aus-/Anhaken nur die jeweilige Person betrifft und nicht das ganze Team.

export interface QualifyHotkeySettings {
  /** true  → Taste „1" qualifiziert den Lead sofort (status='qualified' +
   *          targetStatusId) und schiebt ihn ins CRM.
   *  false → „1" markiert nur die grüne Ampel; das Qualifizieren passiert
   *          gesammelt per „Alle grünen qualifizieren". */
  immediateQualify: boolean;
  /** custom_lead_statuses.id, in den ein grün-qualifizierter Lead wandert. */
  targetStatusId: string;
}

/** Default für Nutzer ohne gespeicherte Einstellung: „Sofort" AN, Ziel „Webdesign Todo". */
const FALLBACK_QUALIFY_HOTKEY: QualifyHotkeySettings = {
  immediateQualify: true,
  targetStatusId: "webdesign-todo",
};

/** Pro-Nutzer-Key im app_settings-Key-Value-Store. */
const qualifyHotkeyKey = (userId: string) => `qualify_hotkey:${userId}`;

export async function getQualifyHotkeySettings(
  userId: string | null,
): Promise<QualifyHotkeySettings> {
  if (!userId) return FALLBACK_QUALIFY_HOTKEY;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", qualifyHotkeyKey(userId))
      .single();
    const v = data?.value as Partial<QualifyHotkeySettings> | undefined;
    return {
      immediateQualify:
        typeof v?.immediateQualify === "boolean"
          ? v.immediateQualify
          : FALLBACK_QUALIFY_HOTKEY.immediateQualify,
      targetStatusId:
        typeof v?.targetStatusId === "string" && v.targetStatusId.trim()
          ? v.targetStatusId
          : FALLBACK_QUALIFY_HOTKEY.targetStatusId,
    };
  } catch {
    return FALLBACK_QUALIFY_HOTKEY;
  }
}

export async function saveQualifyHotkeySettings(
  settings: QualifyHotkeySettings,
  userId: string | null,
): Promise<void> {
  if (!userId) return; // ohne Nutzer-Identität keine (sonst globale) Speicherung
  const db = createServiceClient();
  await db.from("app_settings").upsert(
    {
      key: qualifyHotkeyKey(userId),
      value: settings as unknown as Record<string, unknown>,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}
