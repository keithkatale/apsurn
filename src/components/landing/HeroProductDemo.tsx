"use client";

import { useState } from "react";
import { CalendarClock, Mail, Search, Sparkles } from "lucide-react";
import { BlueprintPreview, ProspectsPreview, SequencePreview } from "@/components/landing/ProductPreviews";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "prospects", label: "Find prospects", icon: Search },
  { id: "sequence", label: "Draft a sequence", icon: Mail },
  { id: "blueprint", label: "Build an ICP", icon: Sparkles },
  { id: "followup", label: "Catch up after time off", icon: CalendarClock },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function HeroProductDemo() {
  const [active, setActive] = useState<TabId>("prospects");

  return (
    <div className="relative mx-auto w-full max-w-[1080px]">
      <div className="overflow-hidden rounded-[28px] sm:rounded-[36px] bg-gradient-to-br from-[#6B7CFF] via-[#C9A0FF] to-[#FF8EC8] p-3 sm:p-5">
        <div className="mb-3 overflow-x-auto sm:mb-4">
          <div className="flex min-w-max rounded-full bg-white/20 p-1 backdrop-blur-sm">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const selected = active === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium transition-colors sm:px-5",
                    selected ? "bg-white text-neutral-950 shadow-sm" : "text-white/90 hover:text-white",
                  )}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] sm:rounded-[28px] bg-white shadow-[0_20px_50px_rgba(30,20,80,0.18)]">
          <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
            <span className="size-2.5 rounded-full bg-[#FF5F57]" />
            <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="size-2.5 rounded-full bg-[#28C840]" />
            <span className="ml-3 text-[13px] font-medium text-neutral-500">apsurn · workspace</span>
          </div>
          <div className="min-h-[320px] bg-[#F8FAFD] p-2 sm:min-h-[420px] sm:p-3">
            {active === "prospects" && <ProspectsPreview />}
            {active === "sequence" && <SequencePreview />}
            {active === "blueprint" && <BlueprintPreview />}
            {active === "followup" && <SequencePreview />}
          </div>
        </div>
      </div>
    </div>
  );
}
