import { Analytics } from '@vercel/analytics/next'
import type { Metadata } from 'next'
import { Fraunces, Geist, Geist_Mono, Manrope, Newsreader, Poppins } from 'next/font/google'
import { PostHogProvider } from '@/components/analytics/PostHogProvider'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' })

const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['SOFT', 'opsz'],
  variable: '--font-fraunces',
  display: 'swap',
  preload: false,
})

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
  preload: false,
})

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
  preload: false,
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://apsurn.com'),
  title: 'apsurn | Find who should buy, from your website',
  description:
    'Paste your website. apsurn drafts your ICP, finds matching companies, and only keeps contacts it can verify.',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'apsurn',
    title: 'apsurn | Find who should buy, from your website',
    description:
      'Paste your website. apsurn drafts your ICP, finds matching companies, and only keeps contacts it can verify.',
    images: [
      {
        url: '/landing/socialshare.png',
        width: 3478,
        height: 2104,
        alt: 'apsurn — Find who should buy, from your website',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'apsurn | Find who should buy, from your website',
    description:
      'Paste your website. apsurn drafts your ICP, finds matching companies, and only keeps contacts it can verify.',
    images: ['/landing/socialshare.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${manrope.variable} ${fraunces.variable} ${poppins.variable} ${newsreader.variable}`}
    >
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/runtime-config.js" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="antialiased font-sans">
        <PostHogProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </PostHogProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
