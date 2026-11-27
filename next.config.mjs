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
  async redirects() {
    return [
      { source: '/dashboard', destination: '/leads', permanent: false },
      { source: '/dashboard/:path*', destination: '/leads', permanent: false },
    ]
  },
  // The admin area must never be indexed, cached or archived.
  async headers() {
    return [
      {
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/admin',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
  // PostHog calls go through our own domain (US cloud) so ad blockers do not drop them.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/icon.svg',
      },
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/array/:path*',
        destination: 'https://us-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ]
  },
}

export default nextConfig
