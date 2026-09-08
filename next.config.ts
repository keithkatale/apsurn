import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  transpilePackages: ["react-globe.gl", "three-globe"],
};

export default nextConfig;
