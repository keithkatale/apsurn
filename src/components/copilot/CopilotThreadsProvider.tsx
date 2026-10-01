"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ConversationSummary } from "@/components/copilot/CopilotSidebar";

type CopilotThreads = {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  select: (id: string | null) => void;
  refresh: () => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const CopilotThreadsContext = createContext<CopilotThreads | null>(null);

/** Holds the Copilot conversation list so the dashboard nav and the chat page share one source of truth. */
export function CopilotThreadsProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/copilot/chat");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rename = useCallback(async (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/copilot/chat?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    setActiveId((current) => (current === id ? null : current));
    setConversations((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/copilot/chat?id=${id}`, { method: "DELETE" });
  }, []);

  const value = useMemo(
    () => ({ conversations, loading, activeId, select: setActiveId, refresh, rename, remove }),
    [conversations, loading, activeId, refresh, rename, remove],
  );

  return <CopilotThreadsContext.Provider value={value}>{children}</CopilotThreadsContext.Provider>;
}

export function useCopilotThreads() {
  const value = useContext(CopilotThreadsContext);
  if (!value) throw new Error("useCopilotThreads must be used within CopilotThreadsProvider");
  return value;
}
