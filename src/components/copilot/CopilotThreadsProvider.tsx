"use client";

import { usePathname } from "next/navigation";
import { idFromPath, pushPath } from "@/lib/nav/url-state";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConversationSummary } from "@/components/copilot/CopilotSidebar";

type CopilotThreads = {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  /** Bumps when the user asks for a blank chat so the session remounts even if the URL stays /dashboard. */
  newChatEpoch: number;
  select: (id: string | null) => void;
  /** Remember the live conversation without rewriting the URL (first message on Home). */
  adopt: (id: string) => void;
  refresh: () => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const CopilotThreadsContext = createContext<CopilotThreads | null>(null);

/** Holds the Copilot conversation list so the dashboard nav and the chat page share one source of truth. */
export function CopilotThreadsProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const pathId = idFromPath(usePathname(), "/dashboard/tasks");
  // Chat id lives in React state — sending a message must not rewrite the URL to /dashboard/tasks/{id}.
  const [activeId, setActiveIdState] = useState<string | null>(pathId);
  const [newChatEpoch, setNewChatEpoch] = useState(0);
  const select = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (id === null) setNewChatEpoch((n) => n + 1);
    // Keep the address bar on /dashboard. Deep links still seed activeId above on first load.
    if (typeof window !== "undefined" && window.location.pathname.startsWith("/dashboard/tasks/")) {
      pushPath("/dashboard");
    } else if (id === null) {
      pushPath("/dashboard");
    }
  }, []);
  const adopt = useCallback((id: string) => {
    setActiveIdState(id);
  }, []);

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

  // Deep links seed activeId above; keep the address bar on /dashboard so chat never remounts on a path change.
  useEffect(() => {
    if (pathId && typeof window !== "undefined" && window.location.pathname.startsWith("/dashboard/tasks/")) {
      pushPath("/dashboard");
    }
  }, [pathId]);

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
    if (activeId === id) select(null);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/copilot/chat?id=${id}`, { method: "DELETE" });
  }, [activeId, select]);

  const value = useMemo(
    () => ({ conversations, loading, activeId, newChatEpoch, select, adopt, refresh, rename, remove }),
    [conversations, loading, activeId, newChatEpoch, select, adopt, refresh, rename, remove],
  );

  return <CopilotThreadsContext.Provider value={value}>{children}</CopilotThreadsContext.Provider>;
}

export function useCopilotThreads() {
  const value = useContext(CopilotThreadsContext);
  if (!value) throw new Error("useCopilotThreads must be used within CopilotThreadsProvider");
  return value;
}
