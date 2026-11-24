import { createBrowserClient } from "@supabase/ssr";
import { resolvePublicSupabaseConfig } from "./public-config";

export function createClient() {
  const { url, anonKey } = resolvePublicSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured for the browser. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "on the running service (they are read at request time), then reload."
    );
  }
  return createBrowserClient(url, anonKey, {
    cookies: {
      encode: "tokens-only",
    },
  });
}
