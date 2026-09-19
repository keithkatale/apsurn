import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone server output for the Cloud Run container (Dockerfile).
  output: "standalone",
  turbopack: {},
  transpilePackages: ["react-globe.gl", "three-globe"],
  // Playwright must stay external (native browser binaries; never bundle).
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
