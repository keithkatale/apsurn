"use client";

import Link from "next/link";
import { BlueprintSim, ContactsSim, SequenceSim } from "@/components/landing/FeatureSimulations";
import ScrollStack, { ScrollStackItem } from "@/components/landing/ScrollStack";

const CARDS = [
  {
    index: "01",
    title: "Understanding your business",
    description: "Who to target, where to find them, and how to win them.",
    primary: { href: "/signup?next=/setup", label: "Get 50 credits" },
    secondary: { href: "#process", label: "See how it works" },
    sim: BlueprintSim,
    previewClass: "lg:w-[400px] lg:max-w-[42%]",
  },
  {
    index: "02",
    title: "Find potential customers",
    description: "People who fit your business, your offer, and why they should buy.",
    primary: { href: "/signup?next=/setup", label: "Get 50 credits" },
    secondary: { href: "#pricing", label: "View plans" },
    sim: ContactsSim,
    previewClass: "lg:w-[400px] lg:max-w-[42%]",
  },
  {
    index: "03",
    title: "Reach out and book",
    description: "Get those prospects to book a call with you, and check out your products.",
    primary: { href: "/signup?next=/setup", label: "Get 50 credits" },
    secondary: { href: "#contact", label: "Book a call" },
    sim: SequenceSim,
    previewClass: "lg:w-[520px] lg:max-w-[48%]",
  },
] as const;

export function WhyUsSection() {
  return (
    <section id="why-us" className="bg-white px-4 pb-8 pt-10 sm:px-8 sm:pt-16">
      <div className="mx-auto w-full max-w-[1200px]">
        <ScrollStack
          useWindowScroll
          itemDistance={72}
          itemScale={0.025}
          itemStackDistance={24}
          stackPosition="16%"
          scaleEndPosition="10%"
          baseScale={0.94}
        >
          {CARDS.map((card) => {
            const Sim = card.sim;
            return (
              <ScrollStackItem key={card.index} itemClassName="feature-stack-card">
                <div className="flex h-full flex-col lg:flex-row lg:items-stretch">
                  <div className="flex w-full min-w-0 flex-col justify-center gap-5 px-5 py-7 sm:px-10 lg:flex-1 lg:px-12">
                    <h2 className="font-heading text-[22px] font-medium leading-7 tracking-[-0.4px] text-[#FAFAFA] sm:text-[24px]">
                      <span className="mr-2.5 text-[#757575]">{card.index}</span>
                      {card.title}
                    </h2>
                    <p className="max-w-[340px] text-[14px] leading-[1.45] text-[#9a9a9a]">{card.description}</p>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <Link
                        href={card.primary.href}
                        className="feature-stack-btn inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[10px] px-4 text-[13px] font-medium"
                      >
                        {card.primary.label}
                      </Link>
                      <Link href={card.secondary.href} className="inline-flex h-9 shrink-0 items-center whitespace-nowrap text-[13px] font-medium text-[#aaaaaa]">
                        {card.secondary.label}
                      </Link>
                    </div>
                  </div>
                  <div className={`m-3 min-h-[220px] overflow-hidden rounded-[12px] bg-[#0f0f0f] lg:m-4 lg:shrink-0 ${card.previewClass}`}>
                    <Sim />
                  </div>
                </div>
              </ScrollStackItem>
            );
          })}
        </ScrollStack>
      </div>
    </section>
  );
}
