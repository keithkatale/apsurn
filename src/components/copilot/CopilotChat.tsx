"use client";

import { useEffect, useRef, useState } from "react";
import { CopilotMarkdown } from "./CopilotMarkdown";
import { ToolActivity } from "./ToolActivity";
import { Composer } from "./Composer";
import type { ActiveTool, UIMessage } from "./types";

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `local-${Date.now()}-${uidCounter}`;
}

const DEFAULT_STARTERS = [
  "Summarize my account and what’s ready to work",
  "Who are my best qualified contacts right now?",
  "Help me create a sequence for my ICP",
] as const;

const MARKET_STARTERS = [
  "What’s worth following up on in Market Insights?",
  "Scan my keywords for new mentions",
  "Save the strongest posts for outreach",
] as const;

function EmptyWelcome({
  marketMode,
  onPick,
}: {
  marketMode: boolean;
  onPick: (prompt: string) => void;
}) {
  const starters = marketMode ? MARKET_STARTERS : DEFAULT_STARTERS;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <p className="text-[13px] font-semibold tracking-wide text-[var(--copilot-accent-dim)]">Copilot</p>
      <h1 className="mt-2 max-w-md text-2xl font-semibold tracking-tight text-[var(--copilot-foreground)] sm:text-[28px]">
        {marketMode ? "Your market listening co-pilot" : "Your AI SDR co-pilot"}
      </h1>
      <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-[var(--copilot-muted)]">
        {marketMode
          ? "Ask about mentions on screen, follow accounts, run scans, and flag posts for outreach — without leaving this view."
          : "Ask about your blueprint, prospects, and campaigns. Copilot can look things up, update lead status, build sequences, and enroll contacts for you."}
      </p>
      <ul className="mt-8 flex w-full max-w-md flex-col gap-2">
        {starters.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="w-full rounded-xl border border-[var(--copilot-card-border)] bg-[var(--copilot-card)] px-3.5 py-2.5 text-left text-[13px] text-[var(--copilot-foreground)] transition-colors hover:bg-[var(--copilot-dropdown-hover)]"
            >
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CopilotChat({ buildContext }: { buildContext?: () => string } = {}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const marketMode = Boolean(buildContext);
  const isEmpty = messages.length === 0 && !sending && streamingText === null && activeTools.length === 0;

  useEffect(() => {
    if (isEmpty) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingText, activeTools, typing, isEmpty]);

  async function sendMessage(message: string) {
    setError(null);
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: message }]);
    setActiveTools([]);
    setStreamingText(null);
    setSending(true);
    setTyping(true);

    try {
      const context = buildContext?.();
      const outgoing = context ? `Context: ${context}\n\n---\n\n${message}` : message;
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: outgoing }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Copilot request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      const toolsAcc: ActiveTool[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim());

          switch (event.type) {
            case "meta":
              if (!activeId && event.conversationId) {
                setActiveId(event.conversationId);
              }
              break;
            case "status":
              setTyping(true);
              break;
            case "token":
              setTyping(false);
              setStreamingText((prev) => (prev ?? "") + event.text);
              finalText += event.text;
              break;
            case "clear_assistant":
              setStreamingText(null);
              finalText = "";
              setTyping(true);
              break;
            case "tool_start":
              setTyping(false);
              toolsAcc.push({ name: event.name, status: "running" });
              setActiveTools([...toolsAcc]);
              break;
            case "tool_end": {
              const idx = [...toolsAcc].reverse().findIndex((t) => t.name === event.name && t.status === "running");
              if (idx !== -1) {
                const realIdx = toolsAcc.length - 1 - idx;
                toolsAcc[realIdx] = { ...toolsAcc[realIdx], status: "done", result: event.result };
                setActiveTools([...toolsAcc]);
              }
              break;
            }
            case "error":
              setError(event.error);
              break;
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        ...toolsAcc.map((t) => ({ id: uid(), role: "tool" as const, toolName: t.name, status: "done" as const, result: t.result })),
        { id: uid(), role: "model" as const, content: finalText },
      ]);
      setActiveTools([]);
      setStreamingText(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copilot request failed");
    } finally {
      setSending(false);
      setTyping(false);
    }
  }

  return (
    <div className="copilot-panel flex h-full w-full flex-col">
      <div
        className={`mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain px-3 py-3 ${
          isEmpty ? "flex flex-col" : "space-y-3"
        }`}
      >
        {isEmpty ? (
          <EmptyWelcome marketMode={marketMode} onPick={sendMessage} />
        ) : (
          <>
            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className="w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[var(--copilot-accent)] px-3 py-2 text-[14px] leading-snug text-white">
                      {m.content}
                    </div>
                  </div>
                );
              }
              if (m.role === "tool") {
                return (
                  <div key={m.id}>
                    <ToolActivity name={m.toolName} status={m.status} />
                  </div>
                );
              }
              return (
                <div key={m.id}>
                  <CopilotMarkdown content={m.content} />
                </div>
              );
            })}

            {activeTools.map((t, i) => (
              <div key={`${t.name}-${i}`}>
                <ToolActivity name={t.name} status={t.status} />
              </div>
            ))}

            {typing && streamingText === null && (
              <div className="copilot-typing" aria-label="Copilot is typing">
                <span />
                <span />
                <span />
              </div>
            )}

            {streamingText !== null && (
              <div>
                <CopilotMarkdown content={streamingText} caret />
              </div>
            )}

            {error && <p className="text-[11px] text-red-600">{error}</p>}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="copilot-composer px-3 pb-6 pt-1">
        <div className="mx-auto w-full max-w-2xl">
          <Composer disabled={sending} busy={sending} onSend={sendMessage} />
        </div>
      </div>
    </div>
  );
}
