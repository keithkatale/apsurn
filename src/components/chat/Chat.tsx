"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import LatticeLoader from "./LatticeLoader";
import Markdown from "./Markdown";
import ThoughtLine from "./ThoughtLine";
import { LeadTableArtifact } from "@/components/copilot/artifacts/LeadTableArtifact";
import type { CopilotArtifact } from "@/lib/agents/types";

type Role = "user" | "model";

type Message = {
  id: string;
  role: Role;
  text: string;
  artifacts?: CopilotArtifact[];
};

type ThinkingStatus = "working" | "done" | "error" | null;

type StreamEvent =
  | { type: "status"; step: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown>; step: string }
  | { type: "tool_done"; name: string; step: string }
  | { type: "artifact"; artifact: CopilotArtifact }
  | { type: "reply"; text: string; model: string; artifacts?: CopilotArtifact[] }
  | { type: "conversation"; id: string }
  | { type: "error"; error: string }
  | { type: "done" };

export type ChatStarter = {
  label: string;
  prompt: string;
};

export default function Chat({
  emptyHeading,
  emptyFooter,
  starters = [],
}: {
  emptyHeading?: ReactNode;
  emptyFooter?: ReactNode;
  starters?: ChatStarter[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState<ThinkingStatus>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [liveArtifacts, setLiveArtifacts] = useState<CopilotArtifact[]>([]);
  const liveArtifactsRef = useRef<CopilotArtifact[]>([]);
  const conversationIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, steps]);

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  function pushStep(step: string) {
    const next = step.trim();
    if (!next) return;
    setSteps((prev) => {
      if (prev[prev.length - 1] === next) return prev;
      return [...prev, next];
    });
  }

  function finishThinking(next: "done" | "error") {
    setThinking(next);
    setLoading(false);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setThinking(null);
      setSteps([]);
    }, next === "error" ? 1400 : 700);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    if (settleTimer.current) clearTimeout(settleTimer.current);
    setError(null);
    setLiveArtifacts([]);
    liveArtifactsRef.current = [];
    setSteps([]);
    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setThinking("working");

    try {
      const history = messages.map(({ role, text: t }) => ({ role, text: t }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          conversationId: conversationIdRef.current,
        }),
      });

      if (!res.ok || !res.body) {
        const fallback = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(fallback?.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotReply = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(payload) as StreamEvent;
          } catch {
            continue;
          }

          if (event.type === "conversation") {
            conversationIdRef.current = event.id;
          } else if (event.type === "status" || event.type === "tool_start" || event.type === "tool_done") {
            pushStep(event.step);
          } else if (event.type === "artifact") {
            const art = event.artifact;
            if (art?.id) {
              setLiveArtifacts((prev) => (prev.some((a) => a.id === art.id) ? prev : [...prev, art]));
              if (!liveArtifactsRef.current.some((a) => a.id === art.id)) {
                liveArtifactsRef.current = [...liveArtifactsRef.current, art];
              }
            }
          } else if (event.type === "reply") {
            gotReply = true;
            const finalArtifacts = (event.artifacts && event.artifacts.length > 0) ? event.artifacts : liveArtifactsRef.current;
            setMessages((prev) => [
              ...prev,
              {
                id: `m-${Date.now()}`,
                role: "model",
                text: event.text,
                artifacts: finalArtifacts.length > 0 ? finalArtifacts : undefined,
              },
            ]);
            setLiveArtifacts([]);
            liveArtifactsRef.current = [];
          } else if (event.type === "error") {
            setError(event.error);
            finishThinking("error");
            return;
          } else if (event.type === "done") {
            finishThinking(gotReply ? "done" : "error");
            return;
          }
        }
      }

      finishThinking(gotReply ? "done" : "error");
      if (!gotReply) setError("No response from the model");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      finishThinking("error");
    }
  }

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text?.trim() || (message.files?.length ? "Sent with attachments" : "");
    if (!text || loading) return;
    void sendMessage(text);
  }

  const isWaiting = thinking !== null;
  const latticeStatus = thinking === "working" ? "working" : thinking === "error" ? "error" : "done";
  const showEmpty = messages.length === 0 && !isWaiting;
  const status = loading ? (thinking === "error" ? "error" : "submitted") : undefined;

  return (
    <div className="simple-chat flex h-full min-h-0 flex-col">
      <div className="mx-auto flex h-full w-full max-w-2xl min-h-0 flex-1 flex-col px-4 pt-4 md:px-6 md:pt-6">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3">
          {showEmpty ? (
            <div className="space-y-6">
              {emptyHeading}
              <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 px-5 py-5 text-center">
                <p className="text-base font-medium text-[var(--foreground)]">Find leads</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  I can read your blueprint, search the web, scrape pages, find people and emails, and save leads.
                </p>
              </div>
              {starters.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {starters.map((starter) => (
                    <button
                      key={starter.label}
                      type="button"
                      disabled={loading}
                      onClick={() => void sendMessage(starter.prompt)}
                      className="rounded-full border border-neutral-200/80 bg-white px-3.5 py-1.5 text-left text-xs font-medium text-neutral-700 shadow-2xs transition hover:border-neutral-400 hover:text-neutral-950 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:text-neutral-100 disabled:opacity-50"
                    >
                      {starter.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {emptyFooter}
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "user" ? (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl border border-neutral-200/80 bg-neutral-100/90 px-4 py-2.5 text-sm leading-relaxed text-neutral-900 shadow-2xs dark:border-neutral-700/80 dark:bg-neutral-800 dark:text-neutral-100">
                  {message.text}
                </div>
              ) : (
                <div className="w-full max-w-[95%] space-y-3">
                  {message.artifacts && message.artifacts.length > 0 ? (
                    <div className="space-y-3">
                      {message.artifacts.map((art) => (
                        <div key={art.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-xs dark:border-neutral-800 dark:bg-[#121212] dark:text-neutral-100 dark:shadow-xl">
                          <LeadTableArtifact artifact={art} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <Markdown content={message.text} />
                </div>
              )}
            </div>
          ))}

          {isWaiting ? (
            <div className="flex flex-col justify-start w-full max-w-[95%] space-y-3">
              {liveArtifacts.length > 0 ? (
                <div className="space-y-3">
                  {liveArtifacts.map((art) => (
                    <div key={art.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-xs dark:border-neutral-800 dark:bg-[#121212] dark:text-neutral-100 dark:shadow-xl">
                      <LeadTableArtifact artifact={art} />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="text-[var(--muted)]">
                <ThoughtLine
                  working={thinking === "working"}
                  steps={steps}
                  label="Thinking"
                  doneLabel="Thought for"
                  glyph={
                    <LatticeLoader
                      iconOnly
                      status={latticeStatus}
                      pattern="orbit"
                      grid={3}
                      shape="round"
                      color="currentColor"
                      doneColor="currentColor"
                      errorColor="#ef4444"
                      cellSize={5}
                      gap={2}
                      step={90}
                      idleOpacity={0.15}
                    />
                  }
                  fontSize={14}
                  color="var(--muted)"
                  collapsible
                  collapseOnSettle
                  showTimer
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 pb-1 pt-1">
          <PromptInput onSubmit={handleSubmit} className="w-full [&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border [&_[data-slot=input-group]]:border-neutral-200/90 dark:[&_[data-slot=input-group]]:border-neutral-800 [&_[data-slot=input-group]]:bg-white dark:[&_[data-slot=input-group]]:bg-neutral-900 [&_[data-slot=input-group]]:shadow-xs" globalDrop multiple>
            <PromptInputHeader>
              <PromptInputAttachments>
                {(attachment) => <PromptInputAttachment data={attachment} />}
              </PromptInputAttachments>
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea placeholder="Message…" disabled={loading} className="min-h-[32px] py-1 text-sm" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
              </PromptInputTools>
              <PromptInputSubmit disabled={loading} status={status} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
