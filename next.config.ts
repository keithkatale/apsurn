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
  transpilePackages: ["react-globe.gl", "three-globe"],
  // Playwright must stay external (native browser binaries; never bundle).
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
