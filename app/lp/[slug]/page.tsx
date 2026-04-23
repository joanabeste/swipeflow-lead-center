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

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      {page.greeting && (
        <p className="text-sm font-medium tracking-wide text-gray-500">
          {page.greeting}
        </p>
      )}
      {page.headline && (
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-gray-900 sm:text-4xl">
          {page.headline}
        </h1>
      )}
      {page.intro_text && (
        <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-gray-700">
          {page.intro_text}
        </p>
      )}

      {embedUrl && (
        <div className="mt-10 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
          <div className="relative aspect-video w-full">
            <iframe
              src={embedUrl}
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
                      className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-gray-900 underline underline-offset-2 hover:no-underline"
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
        <p className="mt-14 whitespace-pre-line border-t border-gray-100 pt-8 text-base leading-relaxed text-gray-700">
          {page.outro_text}
        </p>
      )}

      <footer className="mt-16 border-t border-gray-100 pt-6 text-xs text-gray-400">
        {page.company_name && <span>Persönlich zusammengestellt für {page.company_name}.</span>}
      </footer>
    </main>
  );
}
