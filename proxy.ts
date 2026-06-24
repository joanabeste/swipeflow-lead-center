import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const landingDomain = process.env.NEXT_PUBLIC_LANDING_DOMAIN;

  // ─── Multi-Domain: Landing-Page-Host ──────────────────────────
  // Requests an die separate Landing-Domain (z. B. `demo.swipeflow.de`) werden
  // auf die interne Route `/lp/<slug>` umgeschrieben — komplett an der
  // Supabase-Auth vorbei, damit Prospects ohne Login darauf klicken können.
  if (landingDomain && matchesHost(host, landingDomain)) {
    const url = request.nextUrl.clone();
    if (!url.pathname.startsWith("/lp")) {
      url.pathname = `/lp${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next({ request: { headers: request.headers } });
  }

  // ─── Landing-Pfad auf App-Domain: auch public lassen ──────────
  if (request.nextUrl.pathname.startsWith("/lp/")) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  // ─── Öffentliche Vertrags-Route: Kunde unterschreibt ohne Login ───
  if (request.nextUrl.pathname.startsWith("/vertrag/")) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  // ─── Öffentliche Arbeitsvertrags-Route: Mitarbeiter unterschreibt + füllt Personalfragebogen ohne Login ───
  if (request.nextUrl.pathname.startsWith("/arbeitsvertrag/")) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  // ─── Öffentliche Freigabe-Route: Kunde gibt Social-Media-Posts ohne Login frei ───
  if (request.nextUrl.pathname.startsWith("/freigabe/")) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  // ─── Extern aufgerufene API-Routes ohne Session-Cookie ────────────
  // Vercel-Crons (Bearer CRON_SECRET) und der PhoneMondo-Webhook (HMAC) tragen
  // kein Auth-Cookie. Ohne diese Ausnahme würde das Auth-Gate unten sie auf
  // /login umleiten, bevor der Route-Handler seine eigene Prüfung erreicht.
  // Die Routes authentifizieren sich selbst (CRON_SECRET / Signatur).
  const apiPath = request.nextUrl.pathname;
  if (
    apiPath.startsWith("/api/cron/") ||
    apiPath.startsWith("/api/phonemondo/") ||
    apiPath === "/api/webex/sync-recordings" ||
    // Externe Lead-APIs (Bearer LEADS_IMPORT_API_KEY): /api/leads (Liste),
    // /api/leads/import, /api/leads/<id> (GET/PATCH) und /api/leads/<id>/notes
    // (GET/POST). Die session-authentifizierten Unterrouten /api/leads/<id>/
    // preview|geocode|screenshot-url werden von keiner der Regexes erfasst und
    // bleiben hinter dem Session-Gate.
    apiPath === "/api/leads" ||
    /^\/api\/leads\/[^/]+$/.test(apiPath) ||
    /^\/api\/leads\/[^/]+\/notes$/.test(apiPath)
  ) {
    return NextResponse.next({ request: { headers: request.headers } });
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Nicht eingeloggt und nicht auf /login oder /auth -> Redirect zu /login
  if (!user && !request.nextUrl.pathname.startsWith("/login") && !request.nextUrl.pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Eingeloggt und auf /login -> Redirect zu /
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

/** Host-Match: ignoriert Port (für localhost:3000) und exakte vs. Subdomain. */
function matchesHost(requestHost: string, configuredDomain: string): boolean {
  const h = requestHost.split(":")[0].toLowerCase();
  const d = configuredDomain.split(":")[0].toLowerCase();
  return h === d;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
