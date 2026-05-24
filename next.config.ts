import type { NextConfig } from "next";

const securityHeaders = [
  // Verhindert Clickjacking: Seite darf nicht in fremde Frames.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
  // HSTS nur in Prod aktiv schalten — Preview/Dev ohne TLS-Pin.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  turbopack: {
    // Projekt-Ordner explizit als Root setzen — sonst pickt Next.js die leere
    // package-lock.json in /Users/joana/ als Workspace-Root.
    root: import.meta.dirname,
  },
  experimental: {
    // Default ist 1 MB. Notiz-Anhaenge (bis 25 MB) werden als base64-DataURL
    // in der Server Action uebertragen → Limit grosszuegig anheben.
    serverActions: { bodySizeLimit: "35mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
