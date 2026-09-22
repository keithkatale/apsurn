"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BlueprintPreview, ProspectsPreview, SequencePreview } from "@/components/landing/ProductPreviews";

const FEATURES = [
  {
    icon: "/landing/feat-ai-forecasting.svg",
    title: "ICP from your site",
    description: "Crawl your website and generate a structured blueprint with industries, personas, and value prop.",
  },
  {
    icon: "/landing/feat-dashboard.svg",
    title: "Source-backed prospects",
    description: "Grounded search and public crawl — contacts saved with evidence, not invented lists.",
  },
  {
    icon: "/landing/feat-reporting.svg",
    title: "Verified outreach",
    description: "Mailbox checks before you send, so sequences protect your domain reputation.",
  },
  {
    icon: "/landing/feat-risk.svg",
    title: "Gmail sequences",
    description: "Multi-step campaigns with AI drafts, merge fields, and send from your connected inbox.",
  },
];

const TABS = [
  {
    id: "benefit-1",
    title: "ICP & discovery",
    icon: "/landing/why-tab1-icon.svg",
    heading: "Blueprint-first prospecting",
    description:
      "Start from your company website. apsurn builds an ICP, then finds matching accounts and people with live search — not a static database dump.",
    type: "blueprint" as const,
  },
  {
    id: "benefit-2",
    title: "Outbound workflow",
    icon: "/landing/why-tab2-icon.svg",
    heading: "From lead to sequence",
    description:
      "Qualify contacts, enroll them in campaigns, and send personalized openers and follow-ups through Gmail — the same loop your dashboard runs every day.",
    type: "sequence" as const,
  },
  {
    id: "benefit-3",
    title: "Verified contacts",
    icon: "/landing/why-tab3-icon.svg",
    heading: "Deliverability-aware lists",
    description:
      "Companies are saved when a named person has a verified email or public phone. MX and SMTP checks run before addresses are exposed for outreach.",
    type: "prospects" as const,
  },
];

export function WhyUsSection() {
  const [activeTab, setActiveTab] = useState(0);
  const panelRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const panels = panelRefs.current.filter(Boolean) as HTMLElement[];
    if (!panels.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = panels.indexOf(visible.target as HTMLElement);
        if (index >= 0) setActiveTab(index);
      },
      { threshold: [0.4, 0.55, 0.7], rootMargin: "-20% 0px -20% 0px" }
    );

    panels.forEach((panel) => observer.observe(panel));
    return () => observer.disconnect();
  }, []);

  function scrollToPanel(index: number) {
    panelRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <section id="why-us" className="bg-white py-16 sm:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="mb-16 sm:mb-20 lg:mb-28">
          <div className="hidden md:block w-full rounded-[16px] bg-white p-6 shadow-[0px_4px_20px_0px_rgba(0,0,0,0.04)] border border-[#EEEEEE]">
            <div className="grid grid-cols-4 divide-x divide-[#EEEEEE]">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="flex flex-col gap-5 px-5">
                  <Image src={feature.icon} alt="" width={24} height={24} className="size-6" />
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-[20px] font-semibold text-black tracking-[-0.8px] font-heading leading-snug">
                      {feature.title}
                    </h3>
                    <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[1.25]">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:hidden flex flex-col gap-3 w-full">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="bg-[#FAFAFA] rounded-[12px] p-4 flex flex-col gap-3 border border-neutral-100"
              >
                <Image src={feature.icon} alt="" width={24} height={24} className="size-6" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-[18px] font-semibold text-black tracking-[-0.72px] font-heading leading-[23.4px]">
                    {feature.title}
                  </h3>
                  <p className="text-[16px] text-[#605F5F] tracking-[-0.64px] font-sans leading-[19.2px]">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-14">
          <div className="flex flex-col gap-6 sm:gap-8 lg:sticky lg:top-32 lg:col-span-5 lg:h-[calc(100vh-8rem)] lg:justify-center">
            <div className="flex flex-col gap-3 sm:gap-4">
              <h2 className="font-heading text-2xl font-bold leading-tight tracking-tight text-neutral-950 sm:text-4xl sm:leading-[1.15] lg:text-[44px]">
                Why modern teams{" "}
                <span className="relative inline-block">
                  choose
                  <span className="pointer-events-none absolute -bottom-1.5 left-0 right-0 h-2.5 sm:-bottom-2 sm:h-3">
                    <Image
                      src="/landing/why-choose-underline.svg"
                      alt=""
                      width={146}
                      height={30}
                      className="h-auto w-full object-contain"
                    />
                  </span>
                </span>{" "}
                <span className="relative inline-block">
                  us
                  <span className="pointer-events-none absolute -bottom-1.5 left-0 right-0 h-2.5 sm:-bottom-2 sm:h-3">
                    <Image
                      src="/landing/why-us-underline.svg"
                      alt=""
                      width={50}
                      height={30}
                      className="h-auto w-full object-contain"
                    />
                  </span>
                </span>
              </h2>
              <p className="text-base font-normal leading-relaxed text-neutral-600 sm:text-lg">
                A source-backed AI SDR: blueprint, prospect, verify, and sequence — built for B2B outbound teams.
              </p>
            </div>

            <div className="hidden flex-col gap-2.5 sm:gap-3 lg:flex">
              {TABS.map((tab, idx) => {
                const isActive = activeTab === idx;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => scrollToPanel(idx)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-all sm:p-4 ${
                      isActive
                        ? "border-[#4096FF] bg-[#F4F8FF] shadow-[0px_4px_12px_rgba(64,150,255,0.08)]"
                        : "border-[#F4F4F4] bg-[#FAFAFA] hover:border-neutral-200 hover:bg-neutral-100"
                    }`}
                  >
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10 ${
                        isActive ? "bg-[#4096FF] text-white" : "bg-white text-neutral-700 shadow-xs"
                      }`}
                    >
                      <Image
                        src={tab.icon}
                        alt=""
                        width={20}
                        height={20}
                        className={isActive ? "brightness-0 invert" : ""}
                      />
                    </div>
                    <span
                      className={`text-[15px] tracking-tight sm:text-[17px] ${
                        isActive ? "font-semibold text-[#1650B0]" : "font-medium text-neutral-900"
                      }`}
                    >
                      {tab.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex w-full flex-col lg:col-span-7">
            {TABS.map((tab, idx) => (
              <article
                key={tab.id}
                id={tab.id}
                ref={(node) => {
                  panelRefs.current[idx] = node;
                }}
                className="flex scroll-mt-32 flex-col justify-center py-6 lg:min-h-[85vh] lg:py-10"
              >
                <FeatureCard tab={tab} />
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ tab }: { tab: (typeof TABS)[number] }) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-[#EEEEEE] bg-[#FAFAFA] p-4 shadow-sm transition-all sm:gap-8 sm:rounded-3xl sm:p-8 lg:p-10">
      <div className="flex flex-col gap-2">
        <h3 className="font-heading text-xl font-bold tracking-tight text-neutral-950 sm:text-[28px]">
          {tab.heading}
        </h3>
        <p className="text-sm leading-relaxed text-neutral-600 sm:text-base">{tab.description}</p>
      </div>

      {tab.type === "blueprint" && <BlueprintPreview />}
      {tab.type === "sequence" && <SequencePreview />}
      {tab.type === "prospects" && <ProspectsPreview />}
    </div>
  );
}
