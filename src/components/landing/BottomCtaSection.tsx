"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function BottomCtaSection() {
  return (
    <section id="cta" className="relative pt-12 sm:pt-16 lg:pt-20 pb-0 overflow-hidden bg-white">
      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-[28px] sm:rounded-[40px] overflow-hidden bg-gradient-to-b from-white from-[45%] to-[#CFE2FC] border border-[#E8EFFB] pt-12 sm:pt-16 lg:pt-20 px-4 sm:px-8 pb-0 shadow-[0px_16px_50px_0px_rgba(67,121,238,0.12)]">
          <div
            className="absolute inset-0 pointer-events-none opacity-20 sm:opacity-25 bg-[radial-gradient(#000000_0.85px,transparent_0.85px)] [background-size:18px_18px] sm:[background-size:20px_20px]"
          />

          <div className="relative z-10 flex flex-col items-center text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.04em] text-black font-heading leading-[1.2] max-w-2xl">
              Put outbound on{" "}
              <span className="relative inline-block">
                autopilot
                <span className="absolute -bottom-1 sm:-bottom-2 left-0 right-0 h-2.5 sm:h-3 pointer-events-none">
                  <Image
                    src="/landing/clarity-underline.svg"
                    alt=""
                    width={120}
                    height={30}
                    className="w-full h-auto object-contain"
                  />
                </span>
              </span>{" "}
              today
            </h2>

            <p className="mt-4 sm:mt-5 text-base sm:text-lg text-[#605F5F] max-w-xl font-medium leading-relaxed tracking-tight">
              Start your trial, approve a blueprint, and run verified Gmail sequences — the AI SDR loop for B2B GTM.
            </p>

            <div className="mt-6 sm:mt-7 flex flex-wrap items-center justify-center gap-3 sm:gap-3.5 w-full sm:w-auto">
              <ThreeDButton
                href="/signup?next=/setup"
                variant="solid"
                size="md"
                className="w-full sm:w-auto rounded-xl px-6 h-11"
              >
                <span>Get free trial</span>
                <ArrowRight className="size-4" />
              </ThreeDButton>
              <Link
                href="#pricing"
                className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl border border-[#E6E6E6] bg-white px-6 text-sm font-medium text-black shadow-[0px_6px_10px_0px_rgba(0,0,0,0.05)] transition-all hover:bg-neutral-50 active:bg-neutral-100"
              >
                See our plans
              </Link>
            </div>

            <div className="relative mt-8 sm:mt-12 w-full max-w-[885px] rounded-t-[20px] sm:rounded-t-[32px] bg-[#E6E6E6] p-2 sm:p-3 pb-0 border-t-2 border-x-2 border-white shadow-[0px_8px_30px_0px_rgba(0,0,0,0.1)] overflow-hidden">
              <div className="relative aspect-[16/7] overflow-hidden rounded-t-[14px] sm:rounded-t-[22px] border-t-2 border-x-2 border-white bg-white">
                <Image
                  src="/landing/dashboard.png"
                  alt="Apsurn campaign workspace"
                  width={3478}
                  height={2104}
                  className="absolute inset-x-0 top-0 w-full h-auto max-w-none"
                  sizes="(max-width: 885px) 100vw, 885px"
                  priority={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
