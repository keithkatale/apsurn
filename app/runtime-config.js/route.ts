import { PUBLIC_CONFIG_GLOBAL } from "@/lib/supabase/public-config";

// Read at request time on the running service (Cloud Run sets these on the container, not at build).
// The names go through a variable so the bundler can't inline build-time values.
export const dynamic = "force-dynamic";

const KEYS = { url: "NEXT_PUBLIC_SUPABASE_URL", anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY" } as const;

export function GET() {
  const config = {
    url: process.env[KEYS.url]?.trim() || null,
    anonKey: process.env[KEYS.anonKey]?.trim() || null,
  };
  return new Response(`window.${PUBLIC_CONFIG_GLOBAL}=${JSON.stringify(config)};`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Short cache: cheap on repeat views, picks up an env change soon after a deploy.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
    },
  });
}
