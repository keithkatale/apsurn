"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Minus, ArrowRight } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: "How does apsurn build an Ideal Customer Profile (ICP)?",
      a: "apsurn scrapes your company website, analyzes your product offerings, customer case studies, and positioning, then uses Google Vertex AI & Gemini to synthesize a structured ICP blueprint with target verticals, company sizes, and buyer personas.",
    },
    {
      q: "How are prospect emails discovered and verified?",
      a: "Our search-grounded prospecting crawls verified web sources and runs real-time DNS MX record lookups to ensure zero bounce rates and protect your domain's sending reputation.",
    },
    {
      q: "Can I connect my existing Gmail or Outlook inboxes?",
      a: "Yes, you can securely connect multiple Google Workspace or Microsoft 365 inboxes via OAuth. All tokens are encrypted at rest with AES-256-GCM.",
    },
    {
      q: "Can I change or cancel my plan at any time?",
      a: "Yes, you can upgrade, downgrade, or cancel your subscription whenever you like directly from your dashboard with no hidden contracts or fees.",
    },
    {
      q: "Does the platform support multiple team members?",
      a: "Yes, you can invite your sales reps, assign specific inboxes, share prospect lists, and collaborate on sequencing campaigns seamlessly.",
    },
    {
      q: "Do you offer onboarding assistance?",
      a: "Yes, we provide interactive guided setup, sample campaign templates, and priority technical support to get your automated outbound pipeline running smoothly.",
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
                Answers to common questions about setup, deliverability, pricing, and autonomous outreach.
              </p>
            </div>

            {/* Illustration */}
            <div className="relative size-36 sm:size-52">
              <video
                src="/landing-video/support.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="size-full object-contain"
                aria-label="Support illustration"
              />
            </div>

            {/* Still have questions CTA */}
            <div className="flex flex-col items-start gap-2.5 sm:gap-3 pt-2">
              <span className="text-sm font-semibold text-neutral-800">Still got questions?</span>
              <ThreeDButton href="#contact" variant="solid" size="md" className="rounded-xl">
                <span>Contact us</span>
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
                  className={`rounded-2xl border transition-all overflow-hidden ${
                    isOpen
                      ? "border-[#4096FF]/40 bg-white shadow-sm"
                      : "border-[#EEEEEE] bg-white hover:border-neutral-300"
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
