import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Manrope } from "next/font/google";
import { NavigationLoaderHost } from "@/components/loaders/navigation-loader-host";
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
    icon: "/branding/apsurn-gtm.png",
    apple: "/branding/apsurn-gtm.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${manrope.variable}`}>
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
