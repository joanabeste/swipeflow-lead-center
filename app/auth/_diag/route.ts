// Diagnose-Endpoint: zeigt, welches Vercel-Projekt das Request servt + welche Env-Vars sichtbar sind.
// Nach Debug wieder loeschen. Keine Secrets — nur Praesenz-Checks (true/false).
import { NextResponse } from "next/server";

export async function GET() {
  const env = process.env;
  return NextResponse.json({
    vercelProjectId: env.VERCEL_PROJECT_ID ?? null,
    vercelGitRepoSlug: env.VERCEL_GIT_REPO_SLUG ?? null,
    vercelGitCommitSha: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    vercelEnv: env.VERCEL_ENV ?? null,
    vercelUrl: env.VERCEL_URL ?? null,
    region: env.VERCEL_REGION ?? null,
    keys: {
      CREDENTIALS_ENCRYPTION_KEY: !!env.CREDENTIALS_ENCRYPTION_KEY,
      NEXT_PUBLIC_SUPABASE_URL: !!env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
      PHONEMONDO_WEBHOOK_SECRET: !!env.PHONEMONDO_WEBHOOK_SECRET,
    },
    timestamp: new Date().toISOString(),
  });
}
