import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server output is only for the Cloud Run container (see
  // Dockerfile, which sets NEXT_STANDALONE_BUILD=1). Vercel has its own
  // build/tracing pipeline and doesn't expect `output: "standalone"` — with
  // it set, Vercel's own build step fails looking for a trace file
  // (.next/next-server.js.nft.json) that standalone mode doesn't produce
  // in the location Vercel expects.
  ...(process.env.NEXT_STANDALONE_BUILD === "1" ? { output: "standalone" as const } : {}),
  turbopack: {},
  // Playwright must stay external (native browser binaries; never bundle).
  serverExternalPackages: ["playwright", "playwright-core"],
  // PostHog's own endpoints send no CORS headers and redirect preflights, so a browser on any origin other than
  // the production domain (localhost, preview deploys) is blocked. The browser talks to /ingest on the page's own
  // origin and Next forwards it to PostHog (US cloud).
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  // PostHog's API paths end in a slash; Next must not redirect them.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
