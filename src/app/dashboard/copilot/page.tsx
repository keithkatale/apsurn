"use client";

import { CopilotChat } from "@/components/copilot/CopilotChat";
import { useCopilotThreads } from "@/components/copilot/CopilotThreadsProvider";

export default function CopilotPage() {
  const { activeId, select, refresh } = useCopilotThreads();

  return (
    <div className="copilot-page-shell -m-8 flex h-[calc(100%+4rem)] overflow-hidden bg-neutral-50">
      <div className="min-w-0 flex-1">
        <CopilotChat
          conversationId={activeId}
          onConversationIdChange={(id) => {
            select(id);
            void refresh();
          }}
          onTurnComplete={() => void refresh()}
        />
      </div>
    </div>
  );
}
