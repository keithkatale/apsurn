"use client";

import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";

export function CopilotReasoning({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  if (!text.trim() && !isStreaming) return null;

  return (
    <Reasoning className="w-full" isStreaming={isStreaming} defaultOpen={isStreaming}>
      <ReasoningTrigger />
      <ReasoningContent>{text || " "}</ReasoningContent>
    </Reasoning>
  );
}
