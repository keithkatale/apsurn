"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const TABS = [
  {
    id: "benefit-1",
    title: "Real-time intelligence",
    icon: "/landing/why-tab1-icon.svg",
    heading: "Real-time intelligence",
    description:
      "Get instant insights and forecasts powered by advanced AI so your team can make decisions with clarity.",
    type: "forecast" as const,
  },
  {
    id: "benefit-2",
    title: "Effortless workflow",
    icon: "/landing/why-tab2-icon.svg",
    heading: "Effortless workflow",
    description:
      "Automate repetitive research, discovery, and outreach tasks to save countless manual hours every week.",
    type: "workflow" as const,
  },
  {
    id: "benefit-3",
    title: "Reliable accuracy",
    icon: "/landing/why-tab3-icon.svg",
    heading: "Reliable accuracy",
    description:
      "Consistent, data-driven analysis that helps teams effectively reduce bounce rate and stay ahead with verified contacts.",
    type: "accuracy" as const,
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
                A smarter AI prospecting engine and autonomous sales pipeline built to help revenue teams move with clarity.
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

      {tab.type === "forecast" && (
        <div className="relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-xl border-2 border-white bg-[#EEEEEE] p-3 sm:min-h-[360px] sm:rounded-2xl sm:p-6 lg:p-8">
          <div className="absolute inset-x-3 top-3 aspect-[600/360] overflow-hidden rounded-tl-xl border border-white shadow-lg sm:inset-x-4 sm:top-4">
            <Image
              src="/landing/why-ui-1.png"
              alt="Forecast UI"
              width={600}
              height={360}
              className="h-auto w-full object-cover"
            />
          </div>
          <div className="relative z-10 mt-auto flex items-center gap-2 rounded-xl border border-neutral-700 bg-gradient-to-r from-[#333333] to-neutral-950 px-3.5 py-3 text-white shadow-xl sm:px-5 sm:py-4">
            <span className="truncate text-[13px] font-medium sm:text-[17px]">
              Generate ICP blueprint from website.com
            </span>
            <span className="inline-block h-4 w-0.5 shrink-0 animate-pulse bg-[#4096FF] sm:h-5" />
          </div>
        </div>
      )}

      {tab.type === "workflow" && (
        <div className="relative flex min-h-[280px] flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-[#EEEEEE] p-4 sm:min-h-[360px] sm:rounded-2xl sm:p-8">
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm sm:p-4">
              <div className="flex items-center gap-3">
                <div className="size-9 shrink-0 overflow-hidden rounded-full border sm:size-10">
                  <Image
                    src="/landing/woman-portrait.png"
                    alt="Lead portrait"
                    width={40}
                    height={40}
                    className="size-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-neutral-900">Sarah Jenkins</p>
                  <p className="truncate text-xs text-neutral-500">VP of Sales · Stripe</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                <span>Verified MX Email</span>
                <span>98% Deliverability</span>
              </div>
            </div>

            <div className="flex flex-col justify-center rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm sm:p-4">
              <span className="text-xs font-semibold uppercase text-neutral-400">Sequence Progress</span>
              <p className="mt-1 text-sm font-bold text-neutral-900 sm:text-base">Step 2: Auto-Followup</p>
              <div className="mt-2 h-2 w-full rounded-full bg-neutral-100">
                <div className="h-2 w-[65%] rounded-full bg-[#4096FF]" />
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white shadow-md sm:mt-6">
            <Image src="/landing/cursor-pointer.svg" alt="" width={16} height={16} className="size-4" />
            <span>Automated outreach executing</span>
          </div>
        </div>
      )}

      {tab.type === "accuracy" && (
        <div className="relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-xl border-2 border-white bg-[#EEEEEE] p-3 sm:min-h-[360px] sm:rounded-2xl sm:p-6 lg:p-8">
          <div className="relative aspect-[580/350] w-full overflow-hidden rounded-xl border border-white shadow-xl">
            <Image
              src="/landing/why-ui-3.png"
              alt="Accuracy UI"
              width={580}
              height={350}
              className="h-auto w-full object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}
