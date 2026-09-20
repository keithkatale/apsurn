"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

function setupHref(websiteUrl?: string | null) {
  const host = websiteUrl?.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") ?? "";
  const params = new URLSearchParams({ from: "dashboard" });
  if (host) params.set("url", host);
  return `/setup?${params.toString()}`;
}

export function RebuildBlueprintButton({
  websiteUrl,
}: {
  websiteUrl?: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <ThreeDButton type="button" variant="solid" size="sm" onClick={() => setConfirming(true)}>
        <RefreshCw className="size-3.5" />
        <span>Rebuild blueprint</span>
      </ThreeDButton>
    );
  }

  return (
    <div className="flex max-w-md flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-sm text-neutral-600">
        You&apos;ll enter a company website again. We&apos;ll recrawl it and replace this blueprint. Prospecting
        pauses until you approve the new one.
      </p>
      <div className="flex flex-wrap gap-2">
        <ThreeDButton type="button" variant="solid" size="sm" onClick={() => router.push(setupHref(websiteUrl))}>
          Start over
        </ThreeDButton>
        <ThreeDButton type="button" variant="soft" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </ThreeDButton>
      </div>
    </div>
  );
}
