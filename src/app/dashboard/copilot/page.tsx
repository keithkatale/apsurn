"use client";

import { useCallback, useEffect, useState } from "react";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import { CopilotSidebar, type ConversationSummary } from "@/components/copilot/CopilotSidebar";

export default function CopilotPage() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/copilot/chat");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  async function handleRename(id: string, title: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/copilot/chat?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async function handleDelete(id: string) {
    if (id === conversationId) setConversationId(null);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/copilot/chat?id=${id}`, { method: "DELETE" });
  }

  return (
    <div className="-m-8 flex h-[calc(100%+4rem)] overflow-hidden rounded-none border-neutral-200 bg-white">
      <CopilotSidebar
        conversations={conversations}
        activeId={conversationId}
        loading={loadingConversations}
        onSelect={setConversationId}
        onNewThread={() => setConversationId(null)}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <div className="min-w-0 flex-1">
        <CopilotChat
          conversationId={conversationId}
          onConversationIdChange={(id) => {
            setConversationId(id);
            refreshConversations();
          }}
          onTurnComplete={refreshConversations}
        />
      </div>
    </div>
  );
}
