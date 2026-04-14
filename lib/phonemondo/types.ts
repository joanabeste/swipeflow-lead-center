// Event-Shape, das wir von PhoneMondo per Webhook erwarten.
// Felder/Status-Namen werden ggf. angepasst, sobald die API-Doku verfügbar ist
// — die Handler-Logik in app/api/phonemondo/webhook/route.ts ist tolerant und
// akzeptiert auch teilweise Payloads.

export interface PhoneMondoWebhookEvent {
  /** eindeutige Call-ID bei PhoneMondo — Pflichtfeld zum Zuordnen */
  call_id: string;
  /** Event-Typ, z.B. "call.ringing", "call.answered", "call.ended", "call.missed", "call.failed" */
  event: string;
  /** Optional: Status-String (kann redundant mit `event` sein) */
  status?: string;
  /** Gesamtdauer in Sekunden (typisch erst beim ended-Event) */
  duration_seconds?: number;
  /** Zielnummer für ausgehend / Absendernummer für eingehend */
  phone_number?: string;
  /** Richtung: outbound/inbound */
  direction?: "outbound" | "inbound";
  /** ISO-Zeitstempel */
  started_at?: string;
  ended_at?: string;
  /** Optional: sonstige Zusatzdaten */
  metadata?: Record<string, unknown>;
}

export interface TriggerCallInput {
  /** Ziel-Telefonnummer in E.164 oder national (wird clientseitig normalisiert) */
  target: string;
  /** Durchwahl/Extension des anrufenden Nutzers */
  extension: string;
  /** Optional: Metadaten, die an den Webhook zurückkommen können */
  metadata?: Record<string, unknown>;
}

export interface TriggerCallResult {
  /** PhoneMondo-seitige Call-ID (wird in lead_calls.mondo_call_id gespeichert) */
  callId: string;
}
