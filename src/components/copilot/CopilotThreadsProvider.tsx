"use client";

import { usePathname } from "next/navigation";
import { idFromPath, pushPath } from "@/lib/nav/url-state";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  // /dashboard is a fresh task; /dashboard/tasks/<id> is an existing one.
  const activeId = idFromPath(usePathname(), "/dashboard/tasks");
  const setActiveId = useCallback((id: string | null) => pushPath(id ? `/dashboard/tasks/${id}` : "/dashboard"), []);

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

  // The nav lists tasks on every dashboard page, so load them once when the dashboard opens.
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    void refresh();
  }, [refresh]);

  // Background tasks change state without a chat turn; keep their status dots fresh while any are live.
  const hasLiveTask = conversations.some((c) => ["queued", "running", "waiting", "cancelling"].includes(c.taskStatus ?? ""));
  useEffect(() => {
    if (!hasLiveTask) return;
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [hasLiveTask, refresh]);

  const rename = useCallback(async (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/copilot/chat?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }, []);

  const remove = useCallback(async (id: string) => {
    if (activeId === id) setActiveId(null);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/copilot/chat?id=${id}`, { method: "DELETE" });
  }, [activeId, setActiveId]);

  const value = useMemo(
    () => ({ conversations, loading, activeId, select: setActiveId, refresh, rename, remove }),
    [conversations, loading, activeId, setActiveId, refresh, rename, remove],
  );

  return <CopilotThreadsContext.Provider value={value}>{children}</CopilotThreadsContext.Provider>;
}

export function useCopilotThreads() {
  const value = useContext(CopilotThreadsContext);
  if (!value) throw new Error("useCopilotThreads must be used within CopilotThreadsProvider");
  return value;
}
