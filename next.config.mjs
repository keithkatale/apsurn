/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 blocks dev assets/HMR from any origin other than localhost; without this the page
  // never hydrates when opened via 127.0.0.1 or a LAN IP, and forms fall back to a native GET.
  allowedDevOrigins: ['127.0.0.1', '192.168.*.*', '10.*.*.*'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/icon.svg',
      },
    ]
  },
}

export default nextConfig
