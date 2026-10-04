"use client";

import type { ReactNode } from "react";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import { useCopilotThreads } from "@/components/copilot/CopilotThreadsProvider";

export interface DashboardStarter {
  label: string;
  prompt: string;
}

/**
 * The merged Home + Copilot tab. Idle state (no conversation yet) shows the
 * greeting, prompt box, contextual starters, and the rest of the dashboard
 * (replies/campaigns) below it — all inside CopilotChat's own empty-state
 * slot, so the moment a message is sent the exact same component instance
 * seamlessly becomes the live chat thread, no state handoff required. The
 * blueprint/stats aside is a sibling of CopilotChat, not inside it, so it
 * stays on the right in both states.
 */
export function DashboardHomeShell({
  greeting,
  starters,
  footer,
  aside,
}: {
  greeting: ReactNode;
  starters: DashboardStarter[];
  footer: ReactNode;
  aside: ReactNode;
}) {
  const { activeId, select, refresh } = useCopilotThreads();

  return (
    <div className="grid h-full w-full gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-8">
      <div className="min-h-[70vh] min-w-0 xl:min-h-0">
        <CopilotChat
          conversationId={activeId}
          onConversationIdChange={(id) => {
            select(id);
            void refresh();
          }}
          onTurnComplete={() => void refresh()}
          starters={starters}
          emptyHeading={<div className="mb-5">{greeting}</div>}
          emptyFooter={<div className="mt-8 space-y-8 text-left">{footer}</div>}
          emptyLayout="top"
        />
      </div>
      <aside className="min-w-0 space-y-4 xl:overflow-y-auto">{aside}</aside>
    </div>
  );
}
