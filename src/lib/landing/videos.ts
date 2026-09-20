/**
 * Public Supabase Storage URLs for landing-page loop videos.
 *
 * Returns "" when NEXT_PUBLIC_SUPABASE_URL is unset rather than throwing.
 * These are read during static prerendering of the landing page, and
 * NEXT_PUBLIC_* values are inlined at BUILD time — so any build environment
 * that doesn't have the var (e.g. Cloud Build/buildpacks, which don't
 * inherit Cloud Run's runtime env vars) would otherwise fail the whole
 * build over a decorative video. A missing video is a degraded hero
 * section; a thrown error is a broken deploy.
 */
export function landingVideoUrl(filename: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    console.warn(`[landing] NEXT_PUBLIC_SUPABASE_URL is not set at build time — "${filename}" will not load.`);
    return "";
  }
  return `${base}/storage/v1/object/public/landing-video/${filename}`;
}
