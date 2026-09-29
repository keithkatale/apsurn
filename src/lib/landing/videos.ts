import { resolvePublicSupabaseConfig } from "@/lib/supabase/public-config";

/**
 * Public Supabase Storage URLs for landing-page loop videos.
 *
 * The bucket host comes from the request-time public config (Cloud Run sets
 * NEXT_PUBLIC_SUPABASE_URL on the running service; the root layout injects it
 * into the page). Returns "" when that URL is missing so a deploy still
 * builds — the hero just has no film until the env var is present.
 */

export function landingVideoUrl(filename: string): string {
  const base = resolvePublicSupabaseConfig().url?.replace(/\/$/, "") ?? "";
  if (!base) {
    if (typeof window !== "undefined") {
      console.warn(
        `[landing] NEXT_PUBLIC_SUPABASE_URL is not set on the running service — "${filename}" will not load.`
      );
    }
    return "";
  }
  return `${base}/storage/v1/object/public/landing-video/${filename}`;
}
