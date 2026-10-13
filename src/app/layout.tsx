import type { Metadata } from "next";
import Script from "next/script";
import { Fraunces, Geist, Manrope, Poppins } from "next/font/google";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";
import { SupportChat } from "@/components/support/SupportChat";
import { NavigationLoaderHost } from "@/components/loaders/navigation-loader-host";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { materialSymbolsStylesheet } from "@/lib/campaigns/icon";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

// Apsurn GTM brand faces, used inside the app (dashboard and setup): Fraunces for display type, Poppins for the interface.
// preload is off so marketing pages that never use them don't download them.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
  preload: false,
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://apsurn.com"),
  title: "apsurn | Outbound for founders who'd rather be building",
  description:
    "Paste your website. apsurn finds who should buy, gets their verified emails, and writes the sequence you send from your own Gmail. Built for seed-stage B2B founders.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "apsurn",
    title: "apsurn | Outbound for founders who'd rather be building",
    description:
      "Paste your website. apsurn finds who should buy, gets their verified emails, and writes the sequence you send from your own Gmail. Built for seed-stage B2B founders.",
    images: [
      {
        url: "/landing/socialshare.png",
        width: 3478,
        height: 2104,
        alt: "apsurn — Distribution engine for B2B SaaS startups",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "apsurn | Outbound for founders who'd rather be building",
    description:
      "Paste your website. apsurn finds who should buy, gets their verified emails, and writes the sequence you send from your own Gmail. Built for seed-stage B2B founders.",
    images: ["/landing/socialshare.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${manrope.variable} ${fraunces.variable} ${poppins.variable}`}>
      <head>
        {/* Supabase public config, served at request time by app/runtime-config.js so pages can be built statically.
            A plain blocking script: it must run before any client component creates a Supabase client. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/runtime-config.js" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <script
          id="datafast-queue"
          dangerouslySetInnerHTML={{
            __html: `window.datafast=window.datafast||function(){window.datafast.q=window.datafast.q||[];window.datafast.q.push(arguments);};`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="mu yu bu Su init Vu Gu zu Uu Ku il Wu Yu ju rh oh ah uh hh dh capture getExtension Zu pu gh calculateEventProperties ph register register_once register_for_session unregister unregister_for_session Hu mh getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync wh identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset kh shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty yh ih createPersonProfile setInternalOrTestUser bh xu Cu opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing th debug nl Os getPageViewId captureTraceFeedback captureTraceMetric Du".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init(${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || "phc_Cf6zsfCVLp8Kf4wvcJMi4Nr7tATkeNPcPkXCZBZntsdi")}, {
        api_host: ${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://apsurn.com")},
        ui_host: 'https://us.posthog.com',
        defaults: '2026-05-30',
        person_profiles: 'identified_only'
    });
`,
          }}
        />
        {/* Material Symbols — campaign marks and the send control */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={materialSymbolsStylesheet()} />
      </head>
      <body className="antialiased font-sans">
        <ThemeProvider>
          <PostHogProvider>
            {children}
            <NavigationLoaderHost />
            <SupportChat />
          </PostHogProvider>
        </ThemeProvider>
        <Script
          src="/trackify.js"
          strategy="afterInteractive"
          data-site-id="apsurn-com-stjdg"
        />
        <Script
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
          data-website-id="dfid_WVPHx4F9jvWiYSK4sy9lM"
          data-domain="apsurn.com"
        />
      </body>
    </html>
  );
}
