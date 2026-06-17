import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { normalizeWebsiteUrl } from "@/lib/website-url";

/**
 * Prüft serverseitig, ob die Website eines Leads in ein <iframe> eingebettet
 * werden darf. Viele Seiten verbieten das per `X-Frame-Options` (DENY/SAMEORIGIN)
 * oder CSP `frame-ancestors`. Das Cockpit zeigt bei `embeddable:false` direkt den
 * Screenshot-Fallback statt eines leeren iframes.
 *
 * Bewusst optimistisch: schlägt unser Server-Fetch fehl (Timeout, Bot-Block,
 * DNS), liefern wir `embeddable:true` zurück — der Browser darf es dann versuchen,
 * und der Nutzer kann im Cockpit manuell auf den Screenshot umschalten.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = createServiceClient();
  const { data: lead } = await db
    .from("leads")
    .select("website")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const url = normalizeWebsiteUrl((lead?.website as string | null) ?? null);
  if (!url) return NextResponse.json({ embeddable: false, url: null });

  let embeddable = true;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: {
        // Wie ein echter Browser auftreten, damit weniger Seiten den Server-Fetch
        // als Bot blocken (würde sonst fälschlich „nicht prüfbar" liefern).
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    // Body nicht herunterladen — nur Header interessieren uns.
    res.body?.cancel().catch(() => {});

    const xfo = res.headers.get("x-frame-options")?.toLowerCase() ?? "";
    if (xfo.includes("deny") || xfo.includes("sameorigin")) embeddable = false;

    const csp = res.headers.get("content-security-policy") ?? "";
    const fa = /frame-ancestors([^;]*)/i.exec(csp)?.[1]?.trim().toLowerCase();
    if (fa != null) {
      // 'none' = nie einbettbar; eine Whitelist ohne '*' = auf fremde Origins
      // beschränkt → wir sind sicher nicht dabei. '*' erlaubt alle.
      if (fa.includes("'none'") || !fa.includes("*")) embeddable = false;
    }
  } catch {
    embeddable = true; // unklar → Browser darf es versuchen
  }

  return NextResponse.json(
    { embeddable, url },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
