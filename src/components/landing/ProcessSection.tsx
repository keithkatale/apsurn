"use client";

import Image from "next/image";
import Link from "next/link";

export function ProcessSection() {
  const steps = [
    {
      number: "01",
      title: "Paste your URL",
      description: "apsurn reads your public site and drafts your ideal customer profile: who buys, where to find them, and why they'd care. You edit it and approve it.",
      image: "/landing/step1.png",
    },
    {
      number: "02",
      title: "Get verified prospects",
      description: "apsurn finds companies and decision-makers that match your ICP. Emails it can't verify get dropped, which protects your sending reputation.",
      image: "/landing/campaign.png",
    },
    {
      number: "03",
      title: "Send from your Gmail",
      description: "apsurn writes a personalized multi-step sequence for every lead. Edit any draft, then launch from your own inbox.",
      image: "/landing/leads.png",
    },
  ];

  return (
    <section id="how-it-works" className="relative py-16 sm:py-28 overflow-hidden bg-[#FAFAFA]/50 border-y border-[#EEEEEE]">
      <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none -z-10 flex justify-center px-4">
        <div className="relative w-full max-w-[1400px] h-full rounded-[28px] sm:rounded-[40px] bg-gradient-to-b from-white from-[50%] to-[#F4F4F4]" />
      </div>

      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="mx-auto max-w-2xl text-center flex flex-col items-center gap-2.5 sm:gap-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#4379EE]">How it works</p>
          <h2 className="text-2xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-neutral-950 font-heading leading-tight">
            From your URL to booked calls in three steps
          </h2>
        </div>

        <div className="mt-10 sm:mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="flex flex-col gap-4 sm:gap-5 rounded-2xl bg-white p-3.5 sm:p-4 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] transition-transform hover:-translate-y-1 duration-200"
            >
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-neutral-100 shadow-inner">
                <Image
                  src={step.image}
                  alt={step.title}
                  width={620}
                  height={620}
                  className="size-full object-cover object-top"
                />
                <div className="absolute bottom-3 right-3 flex size-8 sm:size-9 items-center justify-center rounded-full bg-neutral-950 text-white font-medium text-xs sm:text-sm shadow-md border border-neutral-700">
                  {step.number}
                </div>
              </div>

              <div className="flex flex-col gap-1 px-1.5 pb-1">
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-950 font-heading">
                  {step.title}
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <Link
            href="/signup?next=/setup"
            className="landing-hero-cta inline-flex items-center justify-center rounded-[10px] bg-[#4379EE] px-7 py-2.5 text-[13px] font-medium text-white hover:bg-[#3567D6]"
          >
            Get 50 free credits
          </Link>
        </div>
      </div>
    </section>
  );
}
