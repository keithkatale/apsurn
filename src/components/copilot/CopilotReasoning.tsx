"use client";

import { CopilotThought, reasoningToSteps } from "./CopilotThought";

export function CopilotReasoning({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  if (!text.trim() && !isStreaming) return null;

  return (
    <CopilotThought
      working={isStreaming}
      steps={reasoningToSteps(text)}
      historical={!isStreaming}
    />
  );
}
