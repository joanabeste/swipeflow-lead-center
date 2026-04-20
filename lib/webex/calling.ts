// Webex-Calling — Click-to-Call via /telephony/calls/dial.
//
// Voraussetzung: Token hat Scope `spark:calls_write` UND der Webex-User
// (Token-Besitzer) ist ein Webex-Calling-Nutzer mit registriertem Endpoint.
// Webex ruft den Token-Besitzer auf seinem Endpoint an und verbindet mit destination.

import { getWebexToken } from "./auth";

const WEBEX_API_BASE = "https://webexapis.com/v1";

export type DialResult = { callId: string };

/** destination: E.164 oder intern. Webex akzeptiert +49…, tel:+49… oder SIP-URIs. */
export async function dialWebexCall(input: { destination: string }): Promise<DialResult> {
  const token = await getWebexToken();
  const body = JSON.stringify({ destination: input.destination });

  let res: Response;
  try {
    res = await fetch(`${WEBEX_API_BASE}/telephony/calls/dial`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new Error(`Webex nicht erreichbar: ${e instanceof Error ? e.message : "unbekannt"}`);
  }

  if (res.status === 401) {
    throw new Error("Webex-Token ungültig/abgelaufen. In den Einstellungen erneuern.");
  }
  if (res.status === 403) {
    throw new Error(
      "Webex-Token hat nicht den Scope `spark:calls_write` — Token in developer.webex.com mit diesem Scope neu erstellen.",
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Webex /telephony/calls/dial ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json().catch(() => ({}))) as { callId?: string; id?: string };
  const callId = data.callId ?? data.id ?? "";
  if (!callId) {
    throw new Error("Webex-Antwort enthält keine callId.");
  }
  return { callId };
}
