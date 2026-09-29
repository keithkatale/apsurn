"use client";

import Link from "next/link";
import { BlueprintSim, ContactsSim, SequenceSim } from "@/components/landing/FeatureSimulations";
import ScrollStack, { ScrollStackItem } from "@/components/landing/ScrollStack";

const CARDS = [
  {
    index: "01",
    title: "Understanding your business",
    description: "Who to target, where to find them, and how to win them.",
    primary: { href: "/signup?next=/setup", label: "Get $20 credits" },
    secondary: { href: "#process", label: "See how it works" },
    sim: BlueprintSim,
    previewClass: "md:w-[400px] md:max-w-[42%]",
  },
  {
    index: "02",
    title: "Find potential customers",
    description: "People who fit your business, your offer, and why they should buy.",
    primary: { href: "/signup?next=/setup", label: "Get $20 credits" },
    secondary: { href: "#pricing", label: "View plans" },
    sim: ContactsSim,
    previewClass: "md:w-[400px] md:max-w-[42%]",
  },
  {
    index: "03",
    title: "Reach out and book",
    description: "Get those prospects to book a call with you, and check out your products.",
    primary: { href: "/signup?next=/setup", label: "Get $20 credits" },
    secondary: { href: "#contact", label: "Book a call" },
    sim: SequenceSim,
    previewClass: "md:w-[640px] md:max-w-[62%]",
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
                <div className="flex h-full flex-col md:flex-row md:items-stretch">
                  <div className="flex w-full flex-col justify-center gap-5 px-7 py-8 sm:px-10 md:min-w-0 md:flex-1 md:px-12">
                    <h2 className="font-heading text-[22px] font-medium leading-7 tracking-[-0.4px] text-[#FAFAFA] sm:text-[24px]">
                      <span className="mr-2.5 text-[#757575]">{card.index}</span>
                      {card.title}
                    </h2>
                    <p className="max-w-[340px] text-[14px] leading-[1.45] text-[#9a9a9a]">{card.description}</p>
                    <div className="flex items-center gap-5">
                      <Link
                        href={card.primary.href}
                        className="feature-stack-btn inline-flex items-center justify-center rounded-[10px] px-4 py-2 text-[13px] font-medium"
                      >
                        {card.primary.label}
                      </Link>
                      <Link href={card.secondary.href} className="text-[13px] font-medium text-[#aaaaaa]">
                        {card.secondary.label}
                      </Link>
                    </div>
                  </div>
                  <div className={`m-3 min-h-[220px] overflow-hidden rounded-[12px] bg-[#0f0f0f] md:m-4 md:shrink-0 ${card.previewClass}`}>
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
