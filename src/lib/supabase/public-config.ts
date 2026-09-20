/**
 * Supabase's public URL + anon key, resolved at RUNTIME rather than relying
 * on Next.js inlining NEXT_PUBLIC_* at build time.
 *
 * Why: on Cloud Run (and any container host) env vars are set on the running
 * service, but NEXT_PUBLIC_* values are baked into the browser bundle when
 * `next build` runs. A build that didn't have them ships a bundle where both
 * are `undefined`, and no amount of runtime configuration can fix it — the
 * browser never reads process.env. So the server injects them into the HTML
 * per request (see RootLayout) and the browser reads them back from there,
 * falling back to the build-time inlined values when present.
 *
 * Exposing the anon key this way is not a leak: it is designed to be public
 * and ships in the client bundle in a normal build anyway. The service-role
 * key is never involved here.
 */

export const PUBLIC_CONFIG_GLOBAL = "__APSURN_PUBLIC_CONFIG__";

export interface PublicSupabaseConfig {
  url: string | null;
  anonKey: string | null;
}

/** Server-side: read the current process env (request time on a container host). */
export function readPublicSupabaseConfig(): PublicSupabaseConfig {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null,
  };
}

/** Browser-side: prefer the server-injected values, fall back to build-time inlined ones. */
export function resolvePublicSupabaseConfig(): PublicSupabaseConfig {
  if (typeof window !== "undefined") {
    const injected = (window as unknown as Record<string, PublicSupabaseConfig | undefined>)[PUBLIC_CONFIG_GLOBAL];
    if (injected?.url && injected?.anonKey) return injected;
  }
  return readPublicSupabaseConfig();
}
