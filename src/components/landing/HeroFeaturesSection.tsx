"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Volume2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/landing/Navbar";
import { MeshGradient } from "@/components/ui/mesh-gradient";
import { landingVideoUrl } from "@/lib/landing/videos";

const DESKTOP_QUERY = "(min-width: 768px)";
const DESKTOP_FILM = "apsurn-launch-16x9-social.mp4";
const MOBILE_FILM = "apsurn-launch-1x1.mp4";

function HeroLaunchFilm() {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const apply = () => setDesktop(query.matches);
    apply();
    query.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      query.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  useEffect(() => {
    setSoundOn(false);
    setProgress(0);
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.loop = true;
    const start = () => {
      void video.play().catch(() => {});
    };
    if (video.readyState >= 2) start();
    else video.addEventListener("canplay", start, { once: true });
    return () => video.removeEventListener("canplay", start);
  }, [desktop]);

  function syncProgress() {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration === 0) return;
    setProgress(video.currentTime / video.duration);
  }

  function restart() {
    const video = videoRef.current;
    if (!video) return;
    video.loop = true;
    video.currentTime = 0;
    setProgress(0);
    void video.play().catch(() => {});
  }

  function unmute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    setSoundOn(true);
    restart();
  }

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) return;
      const video = videoRef.current;
      if (!video) return;
      video.muted = true;
      setSoundOn(false);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [desktop]);

  const src = desktop === null ? "" : landingVideoUrl(desktop ? DESKTOP_FILM : MOBILE_FILM);

  return (
    <div ref={frameRef} className="relative w-full overflow-hidden rounded-[14px] bg-black">
      {desktop === null || !src ? (
        <div className="aspect-square w-full md:aspect-video" />
      ) : (
        <video
          ref={videoRef}
          key={desktop ? "desktop" : "mobile"}
          className="h-auto w-full"
          src={src}
          autoPlay
          muted
          loop
          playsInline
          aria-label="apsurn launch film"
          onTimeUpdate={syncProgress}
          onEnded={restart}
        />
      )}
      {desktop !== null && src && !soundOn ? (
        <button
          type="button"
          onClick={unmute}
          className="hero-film-unmute absolute left-1/2 top-1/2 z-10 inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[16px] font-semibold"
        >
          <Volume2 className="size-5" />
          Unmute
        </button>
      ) : null}
      {desktop !== null && src ? (
        <div className="hero-film-progress absolute inset-x-0 bottom-0 z-10 h-1.5" aria-hidden>
          <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

const CHIPS = [
  { label: "Draft my ICP", href: "#how-it-works" },
  { label: "Find verified emails", href: "#how-it-works" },
  { label: "Write the sequence", href: "#how-it-works" },
];

export function HeroFeaturesSection() {
  const router = useRouter();
  const [website, setWebsite] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const url = website.trim();
    router.push(url ? `/setup?url=${encodeURIComponent(url)}` : "/setup");
  }

  return (
    <section id="hero" className="landing-hero-shell flex h-svh flex-col bg-white px-[var(--hero-inset)]">
      <div className="mx-auto flex h-full w-full min-h-0 flex-col">
        <Navbar embedded />
        <div className="relative mt-1 min-h-0 flex-1 pb-[var(--hero-inset)]">
          <div className="relative h-full overflow-hidden rounded-[28px] sm:rounded-[32px]">
            <MeshGradient
              className="absolute inset-0"
              color1="#8eb8ff"
              color2="#4379EE"
              color3="#1d4ed8"
              color4="#0a1a4a"
              speed={0.55}
              distortion={0.85}
              swirl={0.5}
              scale={1.35}
              rotation={110}
            />
            <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 py-10 text-center sm:px-10">
              <h1 className="max-w-[920px] font-heading text-[40px] font-semibold leading-[1.08] tracking-[-0.045em] text-white sm:text-[52px] lg:text-[60px]">
                Outbound and GTM for B2B SaaS startups
              </h1>
              <p className="mt-4 max-w-[560px] text-[17px] font-medium text-white/90 sm:text-[20px]">
                Paste your website. apsurn finds who should buy.
              </p>
              <form onSubmit={submit} className="mt-8 w-full max-w-[640px]">
                <div className="hero-prompt flex items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_12px_40px_rgba(8,20,60,0.18)] sm:px-5 sm:py-4">
                  <input
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    placeholder="Paste your website"
                    aria-label="Your website"
                    className="hero-prompt min-w-0 flex-1 bg-transparent text-[16px] text-neutral-900 outline-none placeholder:text-neutral-400"
                  />
                  <button
                    type="submit"
                    aria-label="Start with this website"
                    className="hero-send inline-flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                </div>
              </form>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {CHIPS.map((chip) => (
                  <Link
                    key={chip.label}
                    href={chip.href}
                    className="hero-chip inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium"
                  >
                    {chip.label}
                  </Link>
                ))}
              </div>
              <p className="mt-8 text-[14px] text-white/75 sm:mt-10">
                No sales team needed. No list buying. Cancel anytime.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HeroFilmSection() {
  return (
    <section id="demo" className="bg-white px-5 pb-8 pt-16 sm:px-8 sm:pb-12 sm:pt-20">
      <div className="mx-auto w-full max-w-[1100px]">
        <div className="mb-8 text-center sm:mb-10">
          <h2 className="font-heading text-3xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-[16px] text-[#605F5F] sm:text-[18px]">
            From your URL to the first campaign in about 10 minutes.
          </p>
        </div>
        <HeroLaunchFilm />
      </div>
    </section>
  );
}
