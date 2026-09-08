"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function HeroFeaturesSection() {
  return (
    <section id="hero" className="relative overflow-hidden bg-white pb-16 sm:pb-20 lg:pb-24">
      {/*
        Background card: fills the first viewport so the rounded blue bottom
        is visible on landing (no scroll). Matches Figma h≈900 / max 1024.
      */}
      <div className="absolute inset-x-0 top-0 h-[100svh] max-h-[1024px] min-h-[720px] p-2.5 sm:p-5 pointer-events-none">
        <div className="relative w-full h-full rounded-[28px] sm:rounded-[40px] overflow-hidden border border-[#E8EFFB] bg-gradient-to-b from-white from-[55%] to-[rgba(207,226,252,0.85)]">
          {/*
            Dots only in the lower blue gradient band — masked out of the
            white upper/middle area so they end where the blue ends.
          */}
          <div
            className="absolute inset-x-0 bottom-0 h-[50%] opacity-20 sm:opacity-25 bg-[radial-gradient(#000000_0.85px,transparent_0.85px)] [background-size:18px_18px] sm:[background-size:20px_20px]"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
            }}
          />
        </div>
      </div>

      {/* Hero Content */}
      <div className="relative z-10 mx-auto max-w-[1300px] px-5 sm:px-10 lg:px-20 pt-24 sm:pt-28 lg:pt-32 flex flex-col items-center gap-10 sm:gap-12 lg:gap-14">
        {/* Main Header Row */}
        <div className="w-full flex flex-col lg:flex-row items-center lg:items-start justify-between gap-8 lg:gap-12">
          {/* Left Column: Heading, CTAs, Logos */}
          <div className="w-full lg:max-w-[570px] flex flex-col items-start gap-7 sm:gap-8">
            <div className="flex flex-col items-start gap-3 sm:gap-4 w-full">
              {/* Early Access Badge */}
              <div className="inline-flex items-center gap-2 rounded-lg border border-[#EEEEEE] bg-white px-3 py-1.5 shadow-2xs">
                <span className="size-1.5 rounded-full bg-[#4096FF]" />
                <span className="text-[13px] font-normal text-black tracking-[-0.65px] font-sans">
                  Now available for early access
                </span>
              </div>

              {/* Main Headline */}
              <h1 className="text-[38px] sm:text-[48px] lg:text-[56px] font-semibold text-black tracking-[-1.9px] sm:tracking-[-2.4px] lg:tracking-[-2.8px] leading-[1.18] sm:leading-[1.2] font-heading">
                <span>Distribution engine for</span>
                <br />
                <span className="relative inline-block pb-2.5 pt-1 px-0.5 whitespace-nowrap">
                  <span>B2B SaaS</span>
                  <span className="absolute left-0 bottom-0 w-full h-[16px] sm:h-[20px] lg:h-[24px] pointer-events-none -z-10">
                    <Image
                      src="/landing/hero-underline-modern.svg"
                      alt=""
                      width={194}
                      height={30}
                      className="w-full h-full object-fill"
                    />
                  </span>
                </span>{" "}
                <span className="relative inline-block pb-2.5 pt-1 px-0.5 whitespace-nowrap">
                  <span>startups</span>
                  <span className="absolute left-0 bottom-0 w-full h-[16px] sm:h-[20px] lg:h-[24px] pointer-events-none -z-10">
                    <Image
                      src="/landing/hero-underline-finance.svg"
                      alt=""
                      width={186}
                      height={30}
                      className="w-full h-full object-fill"
                    />
                  </span>
                </span>
              </h1>
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
              <ThreeDButton
                href="/setup"
                variant="solid"
                size="lg"
                className="h-11 sm:h-12 px-5 sm:px-6 rounded-xl font-medium text-[15px] sm:text-[16px] tracking-[-0.64px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.25)] flex items-center gap-3"
              >
                <span>Get free trial</span>
                <ArrowRight className="size-4" />
              </ThreeDButton>
              <Link
                href="#contact"
                className="h-11 sm:h-12 px-5 sm:px-6 rounded-xl border border-[#E6E6E6] bg-white text-black font-medium text-[15px] sm:text-[16px] tracking-[-0.64px] shadow-[0px_6px_10px_0px_rgba(0,0,0,0.05)] hover:bg-neutral-50 active:scale-[0.98] transition-all flex items-center justify-center"
              >
                Contact sales
              </Link>
            </div>

            {/* Partner Logos Ticker */}
            <div className="flex items-center gap-6 sm:gap-8 overflow-hidden opacity-75 grayscale hover:grayscale-0 transition-all pt-1">
              <Image
                src="/landing/brand-3.png"
                alt="Pluto Inc"
                width={116}
                height={26}
                className="h-5 sm:h-6 w-auto object-contain shrink-0"
              />
              <Image
                src="/landing/brand-1.png"
                alt="NovaTech"
                width={118}
                height={26}
                className="h-5 sm:h-6 w-auto object-contain shrink-0"
              />
              <Image
                src="/landing/brand-4.png"
                alt="VitaHealth"
                width={126}
                height={26}
                className="h-5 sm:h-6 w-auto object-contain shrink-0"
              />
              <Image
                src="/landing/brand-2.png"
                alt="Brand"
                width={136}
                height={26}
                className="h-5 sm:h-6 w-auto object-contain shrink-0"
              />
            </div>
          </div>

          {/* Right Column: Illustration & Social Proof */}
          <div className="w-full lg:max-w-[365px] flex flex-col gap-5 sm:gap-6 items-start">
            <div className="w-full max-w-[365px] aspect-[365/274] relative overflow-hidden">
              <video
                src="/landing-video/hero.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 size-full object-contain"
                aria-label="Hero illustration"
              />
            </div>

            <div className="flex flex-col gap-3 max-w-[365px]">
              <p className="text-[15px] sm:text-[16px] text-[#605F5F] tracking-[-0.64px] leading-[1.3] font-normal font-sans">
                Powerful AI platform simplifying reporting and delivering forecasts for faster
                decisions.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Image
                      key={i}
                      src="/landing/star.svg"
                      alt="star"
                      width={12}
                      height={12}
                      className="size-3"
                    />
                  ))}
                </div>
                <span className="text-[13px] font-normal text-black tracking-[-0.65px] font-sans">
                  4.8 rated by 8K+ users
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Features Centerpiece & Grid */}
        <div className="w-full flex flex-col items-center gap-8 sm:gap-10">
          {/* Full Dashboard UI Mockup */}
          <div className="w-full flex justify-center">
            <div className="w-full max-w-[885px] rounded-[24px] sm:rounded-[32px] bg-[#E6E6E6] p-2.5 sm:p-[17px] border-2 border-white shadow-[0px_8px_30px_0px_rgba(0,0,0,0.1)]">
              <div className="w-full rounded-[14px] sm:rounded-[20px] border-2 border-white overflow-hidden bg-white">
                <Image
                  src="/landing/hero-dashboard-ui.png"
                  alt="Platform dashboard interface"
                  width={1079}
                  height={758}
                  className="w-full h-auto block"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Desktop Features Row (4 columns with vertical dividers) */}
          <div className="hidden md:block w-full max-w-[1140px] rounded-[16px] bg-white p-6 shadow-[0px_4px_20px_0px_rgba(0,0,0,0.04)] border border-[#EEEEEE]">
            <div className="grid grid-cols-4 divide-x divide-[#EEEEEE]">
              <div className="flex flex-col gap-5 px-5">
                <Image
                  src="/landing/feat-ai-forecasting.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6"
                />
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-[20px] font-semibold text-black tracking-[-0.8px] font-heading leading-snug">
                    AI driven forecasting
                  </h3>
                  <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[1.25]">
                    See AI-powered revenue and risk predictions in seconds.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-5 px-5">
                <Image
                  src="/landing/feat-dashboard.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6"
                />
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-[20px] font-semibold text-black tracking-[-0.8px] font-heading leading-snug">
                    Unified dashboard
                  </h3>
                  <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[1.25]">
                    Track key metrics in one clean, customizable view.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-5 px-5">
                <Image
                  src="/landing/feat-reporting.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6"
                />
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-[20px] font-semibold text-black tracking-[-0.8px] font-heading leading-snug">
                    Automated reporting
                  </h3>
                  <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[1.25]">
                    Create clear reports instantly with no manual effort.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-5 px-5">
                <Image
                  src="/landing/feat-risk.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6"
                />
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-[20px] font-semibold text-black tracking-[-0.8px] font-heading leading-snug">
                    Risk detection
                  </h3>
                  <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[1.25]">
                    Spot unusual patterns and potential risks right away.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Features Stack */}
          <div className="md:hidden flex flex-col gap-3 w-full">
            <div className="bg-[#FAFAFA] rounded-[12px] p-4 flex flex-col gap-3 border border-neutral-100">
              <Image
                src="/landing/feat-ai-forecasting.svg"
                alt=""
                width={24}
                height={24}
                className="size-6"
              />
              <div className="flex flex-col gap-1">
                <h3 className="text-[18px] font-semibold text-black tracking-[-0.72px] font-heading leading-[23.4px]">
                  AI driven forecasting
                </h3>
                <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[19.2px]">
                  See AI-powered revenue and risk predictions in seconds.
                </p>
              </div>
            </div>

            <div className="bg-[#FAFAFA] rounded-[12px] p-4 flex flex-col gap-3 border border-neutral-100">
              <Image
                src="/landing/feat-dashboard.svg"
                alt=""
                width={24}
                height={24}
                className="size-6"
              />
              <div className="flex flex-col gap-1">
                <h3 className="text-[18px] font-semibold text-black tracking-[-0.72px] font-heading leading-[23.4px]">
                  Unified dashboard
                </h3>
                <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[19.2px]">
                  Track key metrics in one clean, customizable view.
                </p>
              </div>
            </div>

            <div className="bg-[#FAFAFA] rounded-[12px] p-4 flex flex-col gap-3 border border-neutral-100">
              <Image
                src="/landing/feat-reporting.svg"
                alt=""
                width={24}
                height={24}
                className="size-6"
              />
              <div className="flex flex-col gap-1">
                <h3 className="text-[18px] font-semibold text-black tracking-[-0.72px] font-heading leading-[23.4px]">
                  Automated reporting
                </h3>
                <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[19.2px]">
                  Create clear reports instantly with no manual effort.
                </p>
              </div>
            </div>

            <div className="bg-[#FAFAFA] rounded-[12px] p-4 flex flex-col gap-3 border border-neutral-100">
              <Image
                src="/landing/feat-risk.svg"
                alt=""
                width={24}
                height={24}
                className="size-6"
              />
              <div className="flex flex-col gap-1">
                <h3 className="text-[18px] font-semibold text-black tracking-[-0.72px] font-heading leading-[23.4px]">
                  Risk detection
                </h3>
                <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[19.2px]">
                  Spot unusual patterns and potential risks right away.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
