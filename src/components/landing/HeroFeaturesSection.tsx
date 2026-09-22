"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function HeroFeaturesSection() {
  return (
    <section id="hero" className="relative bg-white h-[100svh] min-h-[720px] p-2.5 sm:p-5">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[14px] sm:rounded-[18px] border border-[#C5DBFF] bg-gradient-to-b from-white from-[40%] via-[#A8C8FF] via-[78%] to-[#4379EE]">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-[radial-gradient(rgba(255,255,255,0.55)_0.85px,transparent_0.85px)] [background-size:18px_18px] sm:[background-size:20px_20px]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 38%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 38%)",
          }}
        />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1300px] flex-col px-5 pt-16 pb-8 sm:px-10 sm:pt-20 sm:pb-10 lg:px-20 lg:pb-12">
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="w-full max-w-[720px] flex flex-col items-center text-center gap-7 sm:gap-8">
            <div className="flex flex-col items-center gap-3 sm:gap-4 w-full">
              <div className="inline-flex items-center gap-2 rounded-lg border border-[#EEEEEE] bg-white px-3 py-1.5 shadow-2xs">
                <span className="size-1.5 rounded-full bg-[#4096FF]" />
                <span className="text-[13px] font-normal text-black tracking-[-0.65px] font-sans">
                  Now available for early access
                </span>
              </div>

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

            <p className="max-w-[480px] text-[15px] sm:text-[16px] text-[#605F5F] tracking-[-0.64px] leading-[1.3] font-normal font-sans">
              Powerful AI platform simplifying reporting and delivering forecasts for faster
              decisions.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
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
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 sm:gap-8 overflow-hidden opacity-90 brightness-0 invert">
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
      </div>
    </section>
  );
}
