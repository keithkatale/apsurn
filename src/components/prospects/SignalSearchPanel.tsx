"use client";

import { useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { cn } from "@/lib/cn";
import type { ProspectSearchCriteria } from "./ProspectComposeModal";

type Signal = "launch" | "accelerator" | "hiring";

const SIGNALS: Array<{ id: Signal; title: string; sources: string; why: string }> = [
  {
    id: "launch",
    title: "Just launched",
    sources: "Launch YC · Show HN · Product Hunt · BetaList",
    why: "A new product is asking for its first customers.",
  },
  {
    id: "accelerator",
    title: "Joined an accelerator",
    sources: "The newest Y Combinator batches",
    why: "Funded, early, and building a first sales motion.",
  },
  {
    id: "hiring",
    title: "Hiring right now",
    sources: "Hacker News “Who is hiring?” · job boards",
    why: "A team that is growing has a problem to solve.",
  },
];

/**
 * Prospecting starts from what companies did in public, not from a database filtered by industry. Each signal reads
 * free public sources, and the AI judges from the company's own words whether it needs what you sell.
 */
export function SignalSearchPanel({
  onApprove,
  onTalkToAi,
}: {
  onApprove: (criteria: ProspectSearchCriteria) => void;
  onTalkToAi: () => void;
}) {
  const [selected, setSelected] = useState<Set<Signal>>(new Set(["launch", "accelerator", "hiring"]));
  const [topics, setTopics] = useState("");
  const [limit, setLimit] = useState(15);

  function toggle(id: Signal) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="pr-8">
        <h1 className="font-heading text-base font-semibold text-neutral-900">Find prospects from public signals</h1>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          ICP search is paused. We read places where companies announce themselves, so every lead comes with a dated reason to reach out, not a row from a database.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {SIGNALS.map((signal) => {
          const on = selected.has(signal.id);
          return (
            <li key={signal.id}>
              <button
                type="button"
                onClick={() => toggle(signal.id)}
                aria-pressed={on}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                  on ? "border-[#4379EE] bg-[#E8F1FC]" : "border-[#EEEEEE] hover:bg-neutral-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    on ? "border-[#4379EE] bg-[#4379EE] text-white" : "border-neutral-300",
                  )}
                >
                  {on ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-neutral-900">{signal.title}</span>
                  <span className="block text-[12px] text-neutral-600">{signal.why}</span>
                  <span className="mt-0.5 block text-[11px] text-neutral-400">{signal.sources}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Topics (optional)</span>
        <input
          className="input"
          value={topics}
          placeholder="What they build, e.g. AI agents, devtools"
          onChange={(e) => setTopics(e.target.value)}
        />
        <span className="text-[11px] text-neutral-400">Leave empty and the AI judges fit from what you sell.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">How many companies</span>
        <input
          type="number"
          min={1}
          max={30}
          className="input"
          value={limit}
          onChange={(e) => setLimit(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
        />
      </label>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <ThreeDButton
          type="button"
          variant="solid"
          size="sm"
          className="w-full justify-center"
          disabled={selected.size === 0}
          onClick={() =>
            onApprove({
              industries: "",
              geographies: "",
              personas: "",
              companySizeRange: "",
              limit,
              signals: [...selected],
              topics,
            })
          }
        >
          <Check className="size-4" />
          <span>Find prospects</span>
        </ThreeDButton>
        <button
          type="button"
          onClick={onTalkToAi}
          className="flex items-center justify-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900"
        >
          <MessageCircle className="size-3" />
          Talk to the AI instead
        </button>
      </div>
    </div>
  );
}
