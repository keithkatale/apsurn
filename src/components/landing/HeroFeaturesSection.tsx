"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import Link from "next/link";
import { Navbar } from "@/components/landing/Navbar";
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
    <div ref={frameRef} className="relative mt-[68px] w-full overflow-hidden rounded-[14px] bg-black">
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

export function HeroFeaturesSection() {
  return (
    <section id="hero" className="landing-hero bg-white px-5 pb-16 pt-2 sm:px-8 sm:pb-20 sm:pt-4">
      <div className="mx-auto w-full max-w-[1200px]">
        <Navbar embedded />
        <div className="mt-14 flex flex-col items-center sm:mt-20">
          <h1 className="max-w-[820px] text-center font-heading text-[40px] font-medium leading-[1.06] tracking-[-1.28px] text-neutral-950 sm:text-[52px] lg:text-[62.5px] lg:leading-[66.56px]">
            Get more meetings booked
            <br />
            this week
          </h1>
          <p className="mt-3 max-w-[620px] text-center text-[14.4px] font-normal leading-[18px] text-[#605F5F]">
            Turn your website into verified prospects and Gmail sequences —
            <br className="hidden sm:block" /> an AI SDR loop built for outbound GTM.
          </p>
          <div className="mt-4 flex items-center justify-center gap-6">
            <Link
              href="/signup?next=/setup"
              className="landing-hero-cta inline-flex items-center justify-center rounded-[10px] bg-[#4379EE] px-7 pb-[10px] pt-[9px] text-[12.4px] font-medium leading-[18.2px] text-white hover:bg-[#3567D6]"
            >
              Get free trial
            </Link>
            <Link
              href="#why-us"
              className="landing-hero-link text-[13px] font-medium leading-[18.2px] text-[#605F5F]"
            >
              Learn more
            </Link>
          </div>
          <HeroLaunchFilm />
        </div>
      </div>
    </section>
  );
}
