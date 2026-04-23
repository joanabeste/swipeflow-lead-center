import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getLandingPageBySlug, trackLandingPageView } from "@/lib/landing-pages/server";
import { toLoomEmbedUrl } from "@/lib/landing-pages/generator";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LandingPageBySlug({ params }: Props) {
  const { slug } = await params;
  const page = await getLandingPageBySlug(slug);
  if (!page) notFound();

  // Tracking nicht blockierend — wir wollen den Render nicht um einen DB-
  // Roundtrip verzögern. Fehler werden absichtlich verschluckt; die Counter
  // sind nur ein Orientierungs-Signal.
  const hdrs = await headers();
  const userAgent = hdrs.get("user-agent");
  const forwarded = hdrs.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : hdrs.get("x-real-ip");
  void trackLandingPageView({
    pageId: page.id,
    userAgent,
    ip,
  }).catch(() => {});

  const embedUrl = toLoomEmbedUrl(page.loom_url);
  const loomSrc = embedUrl
    ? `${embedUrl}?hideEmbedTopBar=true&hide_owner=true&hide_share=true&hide_title=true`
    : null;
  const primary = page.primary_color ?? "#0f172a";
  const hasBrandColor = !!page.primary_color;
  const embedDomain = hdrs.get("host") ?? "";
  const calendlySrc = page.calendly_url
    ? `${page.calendly_url}${page.calendly_url.includes("?") ? "&" : "?"}embed_domain=${encodeURIComponent(embedDomain)}&embed_type=Inline&hide_gdpr_banner=1`
    : null;

  return (
    <main
      className="mx-auto max-w-4xl px-6 py-12 sm:py-20"
      style={{ ["--lp-primary" as string]: primary }}
    >
      {page.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.logo_url}
          alt=""
          className="mb-8 h-14 w-auto object-contain"
        />
      )}
      {page.company_name && (
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-medium tracking-wide text-white"
          style={{ backgroundColor: "var(--lp-primary)" }}
        >
          Persönlich für {page.company_name}
        </span>
      )}
      {page.greeting && (
        <p className="mt-4 text-sm font-medium tracking-wide text-gray-500">
          {page.greeting}
        </p>
      )}
      {page.headline && (
        <h1
          className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
          style={{ color: hasBrandColor ? "var(--lp-primary)" : undefined }}
        >
          {page.headline}
        </h1>
      )}
      {page.intro_text && (
        <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-gray-700">
          {page.intro_text}
        </p>
      )}

      {loomSrc && (
        <div className="mt-10 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
          <div className="relative aspect-video w-full">
            <iframe
              src={loomSrc}
              title="Erklär-Video"
              allow="fullscreen"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      )}

      {page.case_studies.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-semibold text-gray-900">Erfolgreiche Beispiele</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {page.case_studies.map((cs) => (
              <article
                key={cs.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                {cs.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cs.image_url}
                    alt=""
                    className="h-40 w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <h3 className="text-base font-semibold text-gray-900">{cs.title}</h3>
                  {cs.subtitle && (
                    <p className="mt-1 text-sm font-medium text-gray-500">{cs.subtitle}</p>
                  )}
                  {cs.description && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                      {cs.description}
                    </p>
                  )}
                  {cs.link_url && (
                    <a
                      href={cs.link_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-4 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 hover:no-underline"
                      style={{ color: "var(--lp-primary)" }}
                    >
                      Mehr erfahren →
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {page.outro_text && (
        <p className="mt-14 whitespace-pre-line text-base leading-relaxed text-gray-700">
          {page.outro_text}
        </p>
      )}

      {calendlySrc && (
        <section className="mt-20">
          <p
            className="text-center text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--lp-primary)" }}
          >
            Nächster Schritt
          </p>
          <h2 className="mt-2 text-center text-2xl font-bold text-gray-900 sm:text-3xl">
            Termin vereinbaren
          </h2>
          <div className="mt-8">
            <iframe
              src={calendlySrc}
              title="Termin buchen"
              loading="lazy"
              className="block w-full"
              style={{ height: "950px", border: 0 }}
            />
          </div>
        </section>
      )}

      <footer className="mt-12 flex flex-col items-start gap-2 text-xs text-gray-400 sm:flex-row sm:items-center sm:justify-between">
        {page.company_name ? (
          <span>Persönlich zusammengestellt für {page.company_name}.</span>
        ) : (
          <span />
        )}
        <nav className="flex items-center gap-4">
          <a
            href="https://swipeflow.de/impressum"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-gray-600"
          >
            Impressum
          </a>
          <a
            href="https://swipeflow.de/datenschutz"
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-gray-600"
          >
            Datenschutz
          </a>
        </nav>
      </footer>
    </main>
  );
}
