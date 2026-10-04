"use client";

import type { CopilotArtifact } from "@/lib/agents/types";
import { sanitizeBlocks } from "@/lib/ui/spec";
import { UiRenderer } from "@/components/ui-spec/UiRenderer";

/** A card the Copilot composed itself from the safe UI vocabulary, including interactive controls. */
export function UiArtifact({ artifact, onPrompt }: { artifact: CopilotArtifact; onPrompt?: (text: string) => void }) {
  const blocks = sanitizeBlocks(artifact.payload.blocks);
  return (
    <div className="space-y-3">
      {artifact.title ? (
        <h3 className="font-heading text-[15px] font-semibold tracking-tight text-[var(--copilot-foreground)]">{artifact.title}</h3>
      ) : null}
      <UiRenderer blocks={blocks} onPrompt={onPrompt} />
    </div>
  );
}
