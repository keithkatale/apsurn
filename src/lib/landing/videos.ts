/** Public Supabase Storage URLs for landing-page loop videos. */
export function landingVideoUrl(filename: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  return `${base}/storage/v1/object/public/landing-video/${filename}`;
}
