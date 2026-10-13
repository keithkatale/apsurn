/** The product demo video: one source of truth for the /demo page, the embed, oEmbed and social tags. */

export const DEMO = {
  path: "/demo",
  embedPath: "/demo/embed",
  title: "apsurn demo: outbound for B2B SaaS startups",
  description:
    "Watch apsurn read a website, find the right buyers with verified emails, and write the email sequence you send from your own Gmail.",
  file: "apsurn-launch-16x9-social.mp4",
  width: 1920,
  height: 1080,
  uploadDate: "2026-10-01",
  /** Optional: the same video on YouTube. Product Hunt's gallery only accepts YouTube links. */
  youtubeUrl: "",
} as const;

// Names go through variables so the bundler cannot freeze build-time values (the server reads them per request).
const ENV_APP_URL = "NEXT_PUBLIC_APP_URL";
const ENV_SUPABASE_URL = "NEXT_PUBLIC_SUPABASE_URL";

export function siteOrigin(): string {
  return (process.env[ENV_APP_URL] || "https://apsurn.com").replace(/\/$/, "");
}

/** Public URL of the hosted mp4 (Supabase Storage), or null when storage isn't configured. */
export function demoVideoUrl(): string | null {
  const base = process.env[ENV_SUPABASE_URL]?.trim().replace(/\/$/, "");
  return base ? `${base}/storage/v1/object/public/landing-video/${DEMO.file}` : null;
}

export const demoPageUrl = () => `${siteOrigin()}${DEMO.path}`;
export const demoEmbedUrl = () => `${siteOrigin()}${DEMO.embedPath}`;
export const demoThumbnailUrl = () => `${siteOrigin()}/landing/socialshare.png`;
export const demoOembedUrl = () => `${siteOrigin()}/api/oembed?url=${encodeURIComponent(demoPageUrl())}&format=json`;
