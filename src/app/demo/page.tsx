import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CopyLinkButton } from "@/components/demo/CopyLinkButton";
import { DEMO, demoEmbedUrl, demoOembedUrl, demoPageUrl, demoThumbnailUrl, demoVideoUrl } from "@/lib/demo";

// Rendered per request so the share tags carry the real video URL from the running service's environment.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const page = demoPageUrl();
  const video = demoVideoUrl();
  const thumbnail = demoThumbnailUrl();
  return {
    title: DEMO.title,
    description: DEMO.description,
    alternates: {
      canonical: page,
      // oEmbed discovery: unfurlers that support it can find the embeddable player from this link.
      types: { "application/json+oembed": demoOembedUrl() },
    },
    openGraph: {
      type: "video.other",
      url: page,
      siteName: "apsurn",
      title: DEMO.title,
      description: DEMO.description,
      images: [{ url: thumbnail, width: 3478, height: 2104, alt: "apsurn product demo" }],
      videos: [
        { url: demoEmbedUrl(), secureUrl: demoEmbedUrl(), type: "text/html", width: DEMO.width, height: DEMO.height },
        ...(video ? [{ url: video, secureUrl: video, type: "video/mp4", width: DEMO.width, height: DEMO.height }] : []),
      ],
    },
    twitter: {
      card: "player",
      title: DEMO.title,
      description: DEMO.description,
      images: [thumbnail],
      players: [{ playerUrl: demoEmbedUrl(), streamUrl: video ?? demoEmbedUrl(), width: DEMO.width, height: DEMO.height }],
    },
  };
}

export default function DemoPage() {
  const page = demoPageUrl();
  const video = demoVideoUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: DEMO.title,
    description: DEMO.description,
    thumbnailUrl: [demoThumbnailUrl()],
    uploadDate: DEMO.uploadDate,
    embedUrl: demoEmbedUrl(),
    ...(video ? { contentUrl: video } : {}),
    publisher: { "@type": "Organization", name: "apsurn", url: page.replace(/\/demo$/, "") },
  };

  return (
    <main className="min-h-dvh bg-[#111111] px-4 py-8 text-[#f0f0f0] sm:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <BrandLogo href="/" size={24} />
          <Link href="/" className="text-sm font-medium text-[#9a9a9a] hover:text-[#f0f0f0]">
            apsurn.com
          </Link>
        </header>

        <div>
          <h1 className="font-heading text-[clamp(1.6rem,4vw,2.5rem)] font-semibold leading-tight tracking-tight">Product demo</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#b5b5b5]">{DEMO.description}</p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-black shadow-[0_8px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
          {video ? (
            <video className="aspect-video w-full" controls playsInline preload="metadata" poster={demoThumbnailUrl()} aria-label={DEMO.title}>
              <source src={video} type="video/mp4" />
              Your browser can&apos;t play this video.
            </video>
          ) : (
            <div className="flex aspect-video items-center justify-center text-sm text-neutral-400">The demo isn&apos;t available right now.</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/signup?next=/setup"
            className="inline-flex rounded-full bg-[#4379EE] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#3567D6]"
          >
            Get 50 free credits
          </Link>
          <a
            href="https://cal.com/keith-katale/30min"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex rounded-full bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15"
          >
            Book a call
          </a>
          <CopyLinkButton url={page} />
          {DEMO.youtubeUrl ? (
            <a href={DEMO.youtubeUrl} target="_blank" rel="noreferrer noopener" className="text-sm text-[#9a9a9a] hover:text-[#f0f0f0]">
              Watch on YouTube
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}
