import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const response = NextResponse.redirect(`${origin}/`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login`);
    user = data.user;
  } else if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "email" | "magiclink",
    });
    if (error) return NextResponse.redirect(`${origin}/login`);
    user = data.user;
  } else {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (!user) return NextResponse.redirect(`${origin}/login`);

  // Prüfen ob ein Profil existiert — KEIN automatisches Erstellen mehr
  const serviceClient = createServiceClient();
  const { data: existingProfile } = await serviceClient
    .from("profiles")
    .select("id, status")
    .eq("id", user.id)
    .single();

  if (!existingProfile) {
    // User hat kein Profil → ist nicht autorisiert
    // Auth-Session wieder löschen
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login`);
  }

  if (existingProfile.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login`);
  }

  return response;
}
