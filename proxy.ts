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
