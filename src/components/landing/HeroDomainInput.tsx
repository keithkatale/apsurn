"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe, Sparkles } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function HeroDomainInput() {
  const [domain, setDomain] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = domain.trim();
    if (!trimmed) {
      router.push("/setup");
      return;
    }
    const cleanUrl = trimmed.replace(/^https?:\/\//i, "");
    router.push(`/setup?url=${encodeURIComponent(cleanUrl)}`);
  }

  function handlePreset(preset: string) {
    router.push(`/setup?url=${encodeURIComponent(preset)}`);
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-3">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row items-center gap-2 p-1.5 rounded-2xl border border-neutral-200/90 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xs transition-all focus-within:border-neutral-400 focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
      >
        <div className="relative flex-1 w-full flex items-center pl-3">
          <Globe className="size-4 text-neutral-400 shrink-0" />
          <input
            type="text"
            className="w-full bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden"
            placeholder="Enter your website (e.g. stripe.com)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>
        <ThreeDButton
          type="submit"
          variant="solid"
          size="md"
          className="w-full sm:w-auto shrink-0 shadow-sm"
        >
          <Sparkles className="size-4" />
          <span>Build Blueprint</span>
          <ArrowRight className="size-4 ml-0.5" />
        </ThreeDButton>
      </form>

      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs text-neutral-500">
        <span className="font-medium text-neutral-600">Try with:</span>
        {["linear.app", "vanta.com", "ramp.com"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handlePreset(item)}
            className="rounded-full bg-neutral-100 hover:bg-neutral-200/80 px-2.5 py-0.5 text-neutral-700 transition-colors cursor-pointer"
          >
            {item}
          </button>
        ))}
        <span className="text-neutral-400">· No card required</span>
      </div>
    </div>
  );
}
