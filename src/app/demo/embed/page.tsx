import type { Metadata } from "next";
import { DEMO, demoThumbnailUrl, demoVideoUrl } from "@/lib/demo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: DEMO.title,
  robots: { index: false, follow: true },
};

/** Bare, full-frame player for iframes: the oEmbed html, the Twitter player card and og:video all point here. */
export default function DemoEmbedPage() {
  const video = demoVideoUrl();
  return (
    <div className="fixed inset-0 bg-black">
      {video ? (
        <video
          className="size-full object-contain"
          controls
          playsInline
          preload="metadata"
          poster={demoThumbnailUrl()}
          aria-label={DEMO.title}
        >
          <source src={video} type="video/mp4" />
        </video>
      ) : (
        <p className="flex size-full items-center justify-center text-sm text-neutral-400">The demo is not available right now.</p>
      )}
    </div>
  );
}
