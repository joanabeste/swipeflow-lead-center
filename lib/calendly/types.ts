// Typen für die Calendly-Integration (Webhook-Payloads + API-Ressourcen).
// Nur die Felder, die wir tatsächlich auswerten — Calendly liefert deutlich mehr.
// Referenz: https://developer.calendly.com/api-docs

/** Events, die wir abonnieren. */
export type CalendlyWebhookEventName = "invitee.created" | "invitee.canceled";

export interface CalendlyInviteePayload {
  /** URI des Invitees — stabiler Idempotenz-Key. */
  uri?: string;
  email?: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: string; // "active" | "canceled"
  text_reminder_number?: string | null;
  cancel_url?: string;
  reschedule_url?: string;
  rescheduled?: boolean;
  cancellation?: {
    canceled_by?: string | null;
    reason?: string | null;
    canceler_type?: string | null;
  } | null;
  scheduled_event?: {
    uri?: string;
    name?: string;
    start_time?: string;
    end_time?: string;
    event_type?: string; // URI des Event-Typs → Mapping-Schlüssel
    location?: {
      type?: string;
      join_url?: string | null;
      location?: string | null;
    } | null;
  } | null;
  /** Antworten auf benutzerdefinierte Fragen (z.B. Telefonnummer). */
  questions_and_answers?: { question?: string; answer?: string }[];
}

export interface CalendlyWebhookEvent {
  event: CalendlyWebhookEventName | string;
  created_at?: string;
  payload: CalendlyInviteePayload;
}

/** Antwort von GET /users/me. */
export interface CalendlyCurrentUser {
  resource: {
    uri: string;            // User-URI
    name?: string;
    email?: string;
    current_organization?: string; // Organization-URI
  };
}

export interface CalendlyEventType {
  uri: string;
  name: string;
  active: boolean;
  scheduling_url?: string;
  duration?: number;
}
