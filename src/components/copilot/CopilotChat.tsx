"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { AgentInspector } from "./AgentInspector";
import { ArtifactSurface } from "./artifacts/ArtifactSurface";
import { CopilotMarkdown } from "./CopilotMarkdown";
import { Composer } from "./Composer";
import { CopilotTurnProgress } from "./CopilotTurnProgress";
import { isToolTreeRunning } from "./CopilotThought";
import { findTool, type ToolCall, type UIMessage } from "./types";

interface HistoryRow {
  id: string;
  role: "user" | "model" | "tool";
  content?: string;
  toolName?: string | null;
  args?: Record<string, unknown>;
  result?: unknown;
  agent?: string;
  callId?: string;
  parentCallId?: string;
  artifactIds?: string[];
}

function nestHistoryTools(flat: Array<ToolCall & { parentCallId?: string }>): ToolCall[] {
  const nodes = new Map<string, ToolCall & { parentCallId?: string }>();
  for (const tool of flat) nodes.set(tool.id, { ...tool, children: [] });
  const roots: ToolCall[] = [];
  for (const tool of nodes.values()) {
    const parent = tool.parentCallId ? nodes.get(tool.parentCallId) : undefined;
    if (parent) parent.children = [...(parent.children ?? []), tool];
    else roots.push(tool);
  }
  return roots;
}

/** Replays the flat row history the GET endpoint returns into the same {role, tools[]} shape a live turn builds locally. */
function messagesFromHistory(rows: HistoryRow[], artifacts: CopilotArtifact[] = []): UIMessage[] {
  const byArtifact = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const out: UIMessage[] = [];
  let pendingTools: Array<ToolCall & { parentCallId?: string }> = [];
  for (const row of rows) {
    if (row.role === "user") {
      out.push({ id: row.id, role: "user", content: row.content ?? "" });
    } else if (row.role === "tool") {
      pendingTools.push({
        id: row.callId || row.id,
        name: row.toolName ?? "tool",
        status: "done",
        args: row.args,
        result: row.result,
        agent: row.agent,
        parentCallId: row.parentCallId,
      });
    } else if (row.role === "model") {
      const attached = (row.artifactIds ?? []).map((id) => byArtifact.get(id)).filter((item): item is CopilotArtifact => Boolean(item));
      out.push({
        id: row.id,
        role: "model",
        content: row.content ?? "",
        tools: pendingTools.length ? nestHistoryTools(pendingTools) : undefined,
        artifacts: attached.length ? attached : undefined,
      });
      pendingTools = [];
    }
  }
  // Tool rows with no answer yet: the agent is mid-turn in the background. Show them as live activity.
  if (pendingTools.length > 0) {
    out.push({ id: `working-${pendingTools[pendingTools.length - 1].id}`, role: "model", content: "", tools: nestHistoryTools(pendingTools) });
  }
  return out;
}

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `local-${Date.now()}-${uidCounter}`;
}

const COPILOT_STARTERS = [
  { label: "Find 10 leads for my ICP", prompt: "Find 10 leads that match my approved ICP" },
  { label: "Create a sequence for my ICP", prompt: "Have Operator create a sequence for my ICP" },
  { label: "Show leads not in a campaign", prompt: "Which prospects are not in a campaign yet?" },
  { label: "Check my latest prospecting run", prompt: "How did my latest prospecting run go?" },
] as const;

function upsertTool(list: ToolCall[], incoming: ToolCall): ToolCall[] {
  const idx = list.findIndex((tool) => tool.id === incoming.id);
  if (idx === -1) return [...list, { children: [], ...incoming }];
  const next = [...list];
  next[idx] = {
    ...next[idx],
    ...incoming,
    children: incoming.children ?? next[idx].children,
    reasoning: incoming.reasoning ?? next[idx].reasoning,
  };
  return next;
}

function patchTools(list: ToolCall[], parentId: string | undefined, incoming: ToolCall): ToolCall[] {
  if (!parentId) return upsertTool(list, incoming);
  return list.map((tool) => {
    if (tool.id === parentId) return { ...tool, children: upsertTool(tool.children ?? [], incoming) };
    if (tool.children?.length) return { ...tool, children: patchTools(tool.children, parentId, incoming) };
    return tool;
  });
}

function appendChildReasoning(list: ToolCall[], parentId: string, text: string): ToolCall[] {
  return list.map((tool) => {
    if (tool.id === parentId) return { ...tool, reasoning: `${tool.reasoning ?? ""}${text}` };
    if (tool.children?.length) return { ...tool, children: appendChildReasoning(tool.children, parentId, text) };
    return tool;
  });
}

export interface CopilotChatProps {
  buildContext?: () => string;
  /** When provided, the conversation is controlled by the parent (e.g. a sidebar). Switching it remounts the chat via `key` below. */
  conversationId?: string | null;
  onConversationIdChange?: (id: string) => void;
  onTurnComplete?: () => void;
  /** Overrides COPILOT_STARTERS in the empty state — e.g. prompts generated from the account's actual data instead of generic ones. */
  starters?: ReadonlyArray<{ label: string; prompt: string }>;
  /**
   * Replaces the default centered "Welcome to Apsurn" heading in the empty
   * state. Pass null to render no heading at all (e.g. when the host page
   * already shows its own greeting above this component).
   */
  emptyHeading?: ReactNode | null;
  /** Extra content rendered below the starter prompts, only in the empty state — e.g. a dashboard's replies/campaigns sections. */
  emptyFooter?: ReactNode;
  /** "center" (default) vertically centers the empty state, matching the standalone Copilot tab. "top" anchors it to the top and allows the footer content below it to scroll, for embedding inside a page that already has its own header. */
  emptyLayout?: "center" | "top";
}

/**
 * Thin wrapper: remounting on an externally-initiated conversationId change
 * (a sidebar click, "New thread") gives that conversation fresh local state
 * for free instead of resetting it by hand. When the session generates its
 * OWN id (the first send of a new thread), `ownedId` is updated to match
 * without bumping `key` — remounting there would wipe the turn that's still
 * streaming, since the id arrives via `meta` long before the DB has the full
 * turn to reload. This is the documented React pattern for "adjust state
 * when a prop changes" (a conditional setState during render, not an
 * effect) — see https://react.dev/learn/you-might-not-need-an-effect.
 */
export function CopilotChat(props: CopilotChatProps = {}) {
  const { conversationId } = props;
  const [session, setSession] = useState<{ key: number; ownedId: string | null }>(() => ({
    key: 0,
    ownedId: conversationId ?? null,
  }));

  if (conversationId !== undefined && conversationId !== session.ownedId) {
    setSession({ key: session.key + 1, ownedId: conversationId });
  }

  return (
    <CopilotChatSession
      key={session.key}
      buildContext={props.buildContext}
      onTurnComplete={props.onTurnComplete}
      initialConversationId={session.ownedId}
      starters={props.starters}
      emptyHeading={props.emptyHeading}
      emptyFooter={props.emptyFooter}
      emptyLayout={props.emptyLayout}
      onConversationIdChange={(id) => {
        setSession((s) => ({ ...s, ownedId: id }));
        props.onConversationIdChange?.(id);
      }}
    />
  );
}

function CopilotChatSession({
  buildContext,
  initialConversationId,
  onConversationIdChange,
  onTurnComplete,
  starters,
  emptyHeading,
  emptyFooter,
  emptyLayout = "center",
}: CopilotChatProps & { initialConversationId: string | null }) {
  const [activeId, setActiveIdState] = useState<string | null>(initialConversationId);
  function setActiveId(id: string) {
    activeIdRef.current = id;
    setActiveIdState(id);
    onConversationIdChange?.(id);
  }
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [activeTools, setActiveTools] = useState<ToolCall[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [liveReasoning, setLiveReasoning] = useState("");
  const [reasoningStreaming, setReasoningStreaming] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [liveArtifacts, setLiveArtifacts] = useState<CopilotArtifact[]>([]);
  const [expandedArtifactId, setExpandedArtifactId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  /** The agent is working on this conversation outside the chat request (a plan, or analysis after a run finished). */
  const [agentBusy, setAgentBusy] = useState(false);
  const activeIdRef = useRef<string | null>(initialConversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const marketMode = Boolean(buildContext);
  const isEmpty = messages.length === 0 && !sending && streamingText === null && activeTools.length === 0 && !liveReasoning;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/copilot/chat")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.companyName === "string" && data.companyName.trim()) {
          setCompanyName(data.companyName.trim());
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTool = useMemo(() => {
    if (!selectedId) return null;
    return findTool(activeTools, selectedId) ?? findTool(messages.flatMap((m) => (m.role === "model" ? m.tools ?? [] : [])), selectedId);
  }, [selectedId, activeTools, messages]);

  useEffect(() => {
    if (isEmpty) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingText, activeTools, typing, liveReasoning, isEmpty]);

  useEffect(() => {
    if (!initialConversationId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/copilot/chat?id=${initialConversationId}`);
        if (!res.ok) throw new Error("Failed to load task");
        const data = await res.json();
        if (cancelled) return;
        setMessages(messagesFromHistory(data.messages ?? [], data.artifacts ?? []));
        setAgentBusy(Boolean(data.agentBusy));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load task");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per mount: a new conversationId remounts this component via `key` in CopilotChat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Re-reads the conversation. `onlyIfBusy` leaves the local transcript alone when the agent is idle,
   * because a just-finished live turn carries reasoning the stored rows don't.
   */
  async function syncConversation(onlyIfBusy: boolean): Promise<boolean> {
    const id = activeIdRef.current;
    if (!id) return false;
    try {
      const res = await fetch(`/api/copilot/chat?id=${id}`);
      if (!res.ok) return false;
      const data = await res.json();
      const busy = Boolean(data.agentBusy);
      if (busy || !onlyIfBusy) setMessages(messagesFromHistory(data.messages ?? [], data.artifacts ?? []));
      setAgentBusy(busy);
      if (!busy) onTurnComplete?.();
      return busy;
    } catch {
      return false;
    }
  }

  // While the agent works in the background, follow along: new tool activity and answers appear as they are saved.
  useEffect(() => {
    if (!agentBusy || sending) return;
    const timer = window.setTimeout(() => void syncConversation(false), 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentBusy, sending, messages]);

  async function sendMessage(message: string) {
    if (sending) return;
    setError(null);
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: message }]);
    setActiveTools([]);
    setStreamingText(null);
    setLiveReasoning("");
    setLiveArtifacts([]);
    setReasoningStreaming(true);
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

      if (res.headers.get("content-type")?.includes("application/json")) {
        // The agent is still finishing background work; the message is queued behind it and answered next.
        const queued = await res.json().catch(() => ({}));
        if (!activeId && queued.conversationId) setActiveId(queued.conversationId);
        setAgentBusy(true);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalText = "";
      let reasoningAcc = "";
      let toolsAcc: ToolCall[] = [];
      let artifactsAcc: CopilotArtifact[] = [];

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
              if (event.status === "thinking") setReasoningStreaming(true);
              break;
            case "reasoning":
              setTyping(false);
              if (event.parentId) {
                toolsAcc = appendChildReasoning(toolsAcc, event.parentId, event.text ?? "");
                setActiveTools([...toolsAcc]);
              } else {
                reasoningAcc += event.text ?? "";
                setLiveReasoning(reasoningAcc);
                setReasoningStreaming(true);
              }
              break;
            case "answer": {
              const answer = typeof event.text === "string" ? event.text : "";
              if (answer && reasoningAcc.endsWith(answer)) {
                reasoningAcc = reasoningAcc.slice(0, -answer.length).replace(/\s+$/, "");
                setLiveReasoning(reasoningAcc);
              }
              finalText = answer;
              setStreamingText(answer);
              setReasoningStreaming(false);
              setTyping(false);
              break;
            }
            case "token":
              setTyping(false);
              setStreamingText((prev) => (prev ?? "") + event.text);
              finalText += event.text;
              break;
            case "clear_assistant":
              if (finalText) {
                reasoningAcc = `${reasoningAcc}${reasoningAcc && !reasoningAcc.endsWith("\n") ? "\n" : ""}${finalText}`;
                setLiveReasoning(reasoningAcc);
              }
              setStreamingText(null);
              finalText = "";
              setTyping(true);
              break;
            case "tool_start": {
              setTyping(false);
              setReasoningStreaming(false);
              const incoming: ToolCall = {
                id: event.id ?? uid(),
                name: event.name,
                status: "running",
                args: event.args,
                agent: event.agent,
              };
              toolsAcc = patchTools(toolsAcc, event.parentId, incoming);
              setActiveTools([...toolsAcc]);
              break;
            }
            case "tool_end": {
              const incoming: ToolCall = {
                id: event.id ?? event.name,
                name: event.name,
                status: "done",
                args: event.args,
                result: event.result,
                agent: event.agent,
              };
              toolsAcc = patchTools(toolsAcc, event.parentId, incoming);
              setActiveTools([...toolsAcc]);
              break;
            }
            case "artifact":
              if (event.artifact) {
                artifactsAcc = [...artifactsAcc, event.artifact];
                setLiveArtifacts(artifactsAcc);
              }
              break;
            case "error":
              setError(event.error);
              break;
            case "done":
              onTurnComplete?.();
              break;
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "model",
          content: finalText,
          reasoning: reasoningAcc.trim() || undefined,
          tools: toolsAcc,
          artifacts: artifactsAcc.length ? artifactsAcc : undefined,
        },
      ]);
      setActiveTools([]);
      setStreamingText(null);
      setLiveReasoning("");
      setLiveArtifacts([]);
      setReasoningStreaming(false);
      // The turn may have handed work to the background (an approved plan, a run still going): keep following it.
      void syncConversation(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copilot request failed");
    } finally {
      setSending(false);
      setTyping(false);
      setReasoningStreaming(false);
    }
  }

  return (
    <div className={`copilot-panel relative flex h-full w-full ${selectedTool ? "copilot-panel-split" : ""}`}>
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${isEmpty && emptyLayout === "center" ? "justify-center" : ""}`}>
        {isEmpty && emptyLayout === "top" ? (
          <div className="copilot-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="mx-auto w-full max-w-2xl">
              {emptyHeading}
              <Composer disabled={sending} busy={sending} onSend={sendMessage} />
              <ul className="copilot-starters" aria-label="Starting options">
                {(starters ?? COPILOT_STARTERS).map((item) => (
                  <li key={item.label}>
                    <button type="button" className="copilot-starter" onClick={() => sendMessage(item.prompt)}>
                      <ArrowRight className="size-3.5 shrink-0 opacity-40" strokeWidth={2} />
                      <span>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {emptyFooter}
            </div>
          </div>
        ) : !isEmpty ? (
        <div className="copilot-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="copilot-user-bubble w-fit max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[16px] leading-snug">
                        {m.content}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="space-y-2">
                    {m.reasoning || (m.tools?.length ?? 0) > 0 ? (
                      <CopilotTurnProgress
                        reasoning={m.reasoning}
                        tools={m.tools}
                        working={false}
                        historical
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                      />
                    ) : null}
                    {m.content ? <CopilotMarkdown content={m.content} /> : null}
                    {m.artifacts?.map((artifact) => (
                      <ArtifactSurface
                        key={artifact.id}
                        artifact={artifact}
                        onPrompt={(text) => void sendMessage(text)}
                        onAgentWork={() => setAgentBusy(true)}
                        expanded={expandedArtifactId === artifact.id}
                        onExpand={() => setExpandedArtifactId(artifact.id)}
                        onCollapse={() => setExpandedArtifactId(null)}
                        onChange={(next) =>
                          setMessages((prev) =>
                            prev.map((message) =>
                              message.role === "model" && message.id === m.id
                                ? { ...message, artifacts: message.artifacts?.map((item) => (item.id === next.id ? next : item)) }
                                : message,
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                );
              })}

              {sending || typing || liveReasoning || reasoningStreaming || activeTools.length > 0 ? (
                <CopilotTurnProgress
                  reasoning={liveReasoning}
                  tools={activeTools}
                  working={
                    !error &&
                    (typing || sending || reasoningStreaming || isToolTreeRunning(activeTools)) &&
                    streamingText === null
                  }
                  error={Boolean(error)}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : null}

              {agentBusy && !sending ? (
                <CopilotTurnProgress reasoning="" tools={[]} working selectedId={selectedId} onSelect={setSelectedId} />
              ) : null}

              {liveArtifacts.map((artifact) => (
                <ArtifactSurface
                  key={artifact.id}
                  artifact={artifact}
                  onPrompt={(text) => void sendMessage(text)}
                  onAgentWork={() => setAgentBusy(true)}
                        expanded={expandedArtifactId === artifact.id}
                  onExpand={() => setExpandedArtifactId(artifact.id)}
                  onCollapse={() => setExpandedArtifactId(null)}
                />
              ))}

              {streamingText !== null && (
                <div>
                  <CopilotMarkdown content={streamingText} caret />
                </div>
              )}

              {error && <p className="text-[11px] text-red-600">{error}</p>}
              <div ref={bottomRef} />
        </div>
        ) : null}

        {!(isEmpty && emptyLayout === "top") && (
          <div className={`px-3 ${isEmpty ? "" : "copilot-composer pb-6 pt-1"}`}>
            <div className="mx-auto w-full max-w-2xl">
              {isEmpty ? (
                <div className="mb-5 text-center">
                  <p className="text-[15px] font-medium text-[var(--copilot-muted)]">Welcome to Apsurn.</p>
                  <h1 className="mt-1 text-[1.65rem] font-semibold tracking-tight text-[var(--copilot-foreground)]">
                    {companyName ? `What should we do for ${companyName}?` : "What do you want us to work on?"}
                  </h1>
                </div>
              ) : null}
              <Composer disabled={sending} busy={sending} onSend={sendMessage} />
              {isEmpty ? (
                <ul className="copilot-starters" aria-label="Starting options">
                  {(starters ?? COPILOT_STARTERS).map((item) => (
                    <li key={item.label}>
                      <button type="button" className="copilot-starter" onClick={() => sendMessage(item.prompt)}>
                        <ArrowRight className="size-3.5 shrink-0 opacity-40" strokeWidth={2} />
                        <span>{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {selectedTool ? (
        <AgentInspector
          tool={selectedTool}
          selectedId={selectedId ?? undefined}
          overlay={marketMode}
          onClose={() => setSelectedId(null)}
          onSelectChild={setSelectedId}
        />
      ) : null}
    </div>
  );
}
