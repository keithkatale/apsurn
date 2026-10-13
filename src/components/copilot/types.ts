import type { TimelineItem } from "@/lib/agents/timeline";

export type UIMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "model"; items: TimelineItem[]; error?: string };
