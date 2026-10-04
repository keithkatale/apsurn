"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Minus, ArrowRight } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { LightThemeOnly } from "@/components/landing/LightThemeOnly";
import { landingVideoUrl } from "@/lib/landing/videos";

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: "Do I need sales experience?",
      a: "No. apsurn drafts your ICP and your emails. You review and adjust them, which is where most founders learn what works.",
    },
    {
      q: "How does apsurn decide who to target?",
      a: "It reads your public website, including product pages, positioning and pricing, and uses AI to draft an ICP with industries, company size, regions and buyer roles. You approve it before any prospecting starts.",
    },
    {
      q: "How are emails verified?",
      a: "apsurn only keeps contacts it can verify. Unverifiable addresses are dropped so you don't burn your domain with bounces.",
    },
    {
      q: "Will this hurt my email domain?",
      a: "apsurn sends at a sensible pace from your own Gmail. We recommend a secondary domain for outbound, which is standard practice for anyone doing cold email.",
    },
    {
      q: "Is there a free plan?",
      a: "There's no ongoing free plan, but every account starts with 50 free credits. You're charged only once those run out.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. There are no contracts on the Startup and Growth plans.",
    },
    {
      q: "Can you just do it for me?",
      a: "Yes. That's the done-with-you sprint. Book a call and we'll scope it.",
    },
  ];

  return (
    <section id="faq" className="py-16 sm:py-28 bg-[#FAFAFA]/50 overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-start">
          {/* Left Column: Sticky Header & Illustration */}
          <div className="lg:col-span-5 lg:sticky lg:top-28 flex flex-col gap-5 sm:gap-6">
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <h2 className="text-2xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-neutral-950 font-heading leading-tight">
                Help and{" "}
                <span className="relative inline-block">
                  support
                  <span className="absolute -bottom-1.5 sm:-bottom-2 left-0 right-0 h-2.5 sm:h-3 pointer-events-none">
                    <Image
                      src="/landing/support-underline.svg"
                      alt=""
                      width={155}
                      height={30}
                      className="w-full h-auto object-contain"
                    />
                  </span>
                </span>
              </h2>
              <p className="text-base sm:text-lg text-neutral-600 font-normal leading-relaxed">
                Straight answers for founders doing their own outbound.
              </p>
            </div>

            <LightThemeOnly>
              <div className="relative size-36 sm:size-52">
                <video
                  src={landingVideoUrl("support.mp4")}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="size-full object-contain"
                  aria-label="Support illustration"
                />
              </div>
            </LightThemeOnly>

            {/* Still have questions CTA */}
            <div className="flex flex-col items-start gap-2.5 sm:gap-3 pt-2">
              <span className="text-sm font-semibold text-neutral-800">Still got questions?</span>
              <ThreeDButton href="mailto:hello@apsurn.com" variant="solid" size="md" className="rounded-xl">
                <span>Email Keith</span>
                <ArrowRight className="size-3.5" />
              </ThreeDButton>
            </div>
          </div>

          {/* Right Column: Accordion List */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {faqs.map((faq, idx) => {
              const isOpen = openIdx === idx;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl transition-all overflow-hidden ${
                    isOpen ? "bg-white shadow-sm" : "bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between gap-4 p-4 sm:p-6 text-left cursor-pointer"
                  >
                    <span className="text-base sm:text-lg font-bold text-neutral-950 font-heading tracking-tight">
                      {faq.q}
                    </span>
                    <div
                      className={`flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                        isOpen ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {isOpen ? <Minus className="size-3.5 sm:size-4" /> : <Plus className="size-3.5 sm:size-4" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-5 sm:px-6 sm:pb-6 pt-0 text-sm sm:text-base text-neutral-600 leading-relaxed border-t border-neutral-50">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
