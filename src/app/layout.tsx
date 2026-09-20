import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Manrope } from "next/font/google";
import { NavigationLoaderHost } from "@/components/loaders/navigation-loader-host";
import { PUBLIC_CONFIG_GLOBAL, readPublicSupabaseConfig } from "@/lib/supabase/public-config";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "apsurn — AI SDR & Autonomous Prospecting Engine",
  description: "Outbound sales on autopilot. Turn your website into a 24/7 autonomous prospecting machine.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read at render time so container hosts (Cloud Run) can supply these as
  // ordinary runtime env vars, instead of requiring them at `next build`.
  const publicConfig = readPublicSupabaseConfig();

  return (
    <html lang="en" className={`${geist.variable} ${manrope.variable}`}>
      <head>
        <script
          // Must run before any client component tries to build a Supabase
          // client, so it is inlined in <head> rather than via next/script.
          dangerouslySetInnerHTML={{
            __html: `window.${PUBLIC_CONFIG_GLOBAL}=${JSON.stringify(publicConfig)};`,
          }}
        />
      </head>
      <body className="antialiased font-sans">
        {children}
        <NavigationLoaderHost />
        <Script
          src="/trackify.js"
          strategy="afterInteractive"
          data-site-id="apsurn-com-stjdg"
        />
      </body>
    </html>
  );
}
