/**
 * Next.js instrumentation hook.
 *
 * `onRequestError` läuft server-seitig mit dem unsanitized Error
 * (während die Prod-Error-Boundary im Client nur den Digest sieht).
 * Wir schreiben Pfad + Message + Stack in `error_logs`, damit der Owner
 * im Supabase-SQL-Editor sehen kann, was wirklich gebrochen ist.
 *
 * Doku: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  // Platzhalter — Next.js ruft diesen Hook beim Cold-Start.
}

type RequestInfo = {
  path?: string;
  method?: string;
};

export async function onRequestError(err: unknown, request: RequestInfo) {
  const e = err as { message?: string; stack?: string; digest?: string };
  const digest = e.digest ?? null;
  const message = e.message?.slice(0, 2000) ?? null;
  const stack = e.stack?.slice(0, 8000) ?? null;

  // Immer in Vercel-Logs schreiben — zweiter Kanal falls DB-Insert scheitert.
  console.error("[onRequestError]", {
    path: request.path,
    method: request.method,
    digest,
    message,
  });

  try {
    // Dynamischer Import: server-only Module dürfen hier erst zur Ausführungszeit
    // geladen werden, damit das Hot-Reload beim Dev-Start nicht blockt.
    const { createServiceClient } = await import("@/lib/supabase/server");
    const db = createServiceClient();
    await db.from("error_logs").insert({
      path: request.path ?? null,
      method: request.method ?? null,
      message,
      stack,
      digest,
    });
  } catch (logErr) {
    // Logger-Fehler niemals weiterwerfen — sonst Endlos-Loop.
    console.error("[onRequestError] failed to persist error:", logErr);
  }
}
