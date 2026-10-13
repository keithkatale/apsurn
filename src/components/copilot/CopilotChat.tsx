"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { resultError } from "@/lib/agents/run-events";
import type { RunState, TimelineItem, ToolItem } from "@/lib/agents/timeline";
import { ArtifactSurface } from "./artifacts/ArtifactSurface";
import { Composer } from "./Composer";
import { AgentTimeline } from "./timeline/AgentTimeline";
import { useRunStream } from "./timeline/useRunStream";
import type { UIMessage } from "./types";

interface HistoryRow {
  id: string;
  role: "user" | "model" | "tool";
  content?: string;
  toolName?: string | null;
  args?: Record<string, unknown>;
  result?: unknown;
  callId?: string;
  artifactIds?: string[];
  timeline?: TimelineItem[];
  error?: string;
}

/**
 * Turns the stored rows into messages. A turn that ran with the live timeline carries it (what the user watched,
 * saved with the answer); older turns only have tool rows and text, which are rebuilt into the same shape.
 */
function messagesFromHistory(rows: HistoryRow[]): UIMessage[] {
  const out: UIMessage[] = [];
  let pendingTools: ToolItem[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      out.push({ id: row.id, role: "user", content: row.content ?? "" });
    } else if (row.role === "tool") {
      const error = resultError(row.result);
      pendingTools.push({
        kind: "tool",
        id: row.callId || row.id,
        name: row.toolName ?? "tool",
        args: row.args ?? {},
        status: error ? "failed" : "done",
        startedAt: 0,
        progress: {},
        result: row.result,
        error: error ?? undefined,
      });
    } else if (row.role === "model") {
      let items: TimelineItem[];
      if (row.timeline && row.timeline.length > 0) {
        items = row.timeline;
      } else {
        items = [...pendingTools];
        if (row.content?.trim()) items.push({ kind: "text", id: `t-${row.id}`, text: row.content });
        for (const id of row.artifactIds ?? []) items.push({ kind: "artifact", id, artifact: { id } });
      }
      out.push({ id: row.id, role: "model", items, error: row.error });
      pendingTools = [];
    }
  }
  return out;
}

/** Wall-clock time, read only from event handlers. */
function clockNow(): number {
  return Date.now();
}

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `local-${Date.now()}-${uidCounter}`;
}

const COPILOT_STARTERS = [
  { label: "Find 10 leads for my ICP", prompt: "Find 10 leads that match my approved ICP" },
  { label: "Create a sequence for my ICP", prompt: "Create a sequence for my ICP" },
  { label: "Show leads not in a campaign", prompt: "Which prospects are not in a campaign yet?" },
  { label: "Search the web for startups that just raised", prompt: "Search the web for B2B SaaS startups that just raised a seed round and read the top result" },
] as const;

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
  /** Cards by id: the live run delivers them whole, saved timelines only point at them. */
  const [artifacts, setArtifacts] = useState<Record<string, CopilotArtifact>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  /** The run as the page load found it, so a refresh paints the live view immediately. */
  const [runSeed, setRunSeed] = useState<RunState | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expandedArtifactId, setExpandedArtifactId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(initialConversationId);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  /** After Send, the newest exchange gets a full screen of room so the question rises to the top and the answer has space below it. */
  const [pinned, setPinned] = useState(false);
  const [viewportH, setViewportH] = useState(0);
  const justSentRef = useRef(false);
  const running = Boolean(activeRunId) || starting;
  const isEmpty = messages.length === 0 && !running;
  const marketMode = Boolean(buildContext);
  void marketMode;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/copilot/chat")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.companyName === "string" && data.companyName.trim()) setCompanyName(data.companyName.trim());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Load the saved conversation (and find a run still going, so a reload picks the live view back up). The last
   * answer from the server is kept in sessionStorage and painted first, so reopening a task is instant while the
   * fresh copy loads.
   */
  const applyConversation = useCallback((data: { messages?: HistoryRow[]; artifacts?: CopilotArtifact[]; activeRunId?: string | null; run?: { items: TimelineItem[]; label: string; lastSeq: number; status: string } | null }) => {
    setMessages(messagesFromHistory(data.messages ?? []));
    setArtifacts(Object.fromEntries((data.artifacts ?? []).map((artifact: CopilotArtifact) => [artifact.id, artifact])));
    const runId = typeof data.activeRunId === "string" ? data.activeRunId : null;
    if (runId && data.run) setRunSeed({ items: data.run.items, label: data.run.label, status: "running", error: null, lastSeq: data.run.lastSeq });
    return runId;
  }, []);

  const loadConversation = useCallback(
    async (id: string, options: { paintCached?: boolean } = {}): Promise<{ ok: boolean; activeRunId: string | null }> => {
      const cacheKey = `copilot-conversation:${id}`;
      if (options.paintCached) {
        try {
          const cached = window.sessionStorage.getItem(cacheKey);
          if (cached) {
            const data = JSON.parse(cached);
            const runId = applyConversation(data);
            if (runId) {
              setRunStartedAt(clockNow());
              setActiveRunId(runId);
            }
          }
        } catch {
          /* no cache */
        }
      }
      const res = await fetch(`/api/copilot/chat?id=${id}`);
      if (!res.ok) return { ok: false, activeRunId: null };
      const data = await res.json();
      try {
        const text = JSON.stringify(data);
        if (text.length < 400_000) window.sessionStorage.setItem(cacheKey, text);
      } catch {
        /* storage full or blocked */
      }
      return { ok: true, activeRunId: applyConversation(data) };
    },
    [applyConversation],
  );

  useEffect(() => {
    if (!initialConversationId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadConversation(initialConversationId, { paintCached: true });
        if (cancelled) return;
        if (!loaded.ok) throw new Error("Failed to load task");
        if (loaded.activeRunId) {
          setRunStartedAt(clockNow());
          setActiveRunId(loaded.activeRunId);
        }
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

  const onRunFinished = useCallback(
    async (finished: RunState) => {
      // Swap the live view for the saved message in one step so nothing flashes or disappears.
      const id = activeIdRef.current;
      // Cards the run delivered whole stay usable even if the reload is slow.
      const delivered = finished.items.filter((item): item is Extract<TimelineItem, { kind: "artifact" }> => item.kind === "artifact");
      if (delivered.length > 0) {
        setArtifacts((prev) => ({ ...Object.fromEntries(delivered.map((item) => [item.id, item.artifact as unknown as CopilotArtifact])), ...prev }));
      }
      try {
        if (!id) throw new Error("no conversation");
        const loaded = await loadConversation(id);
        if (!loaded.ok) throw new Error("reload failed");
      } catch {
        // Keep what was watched rather than losing it.
        setMessages((prev) => [...prev, { id: uid(), role: "model", items: finished.items, error: finished.error ?? undefined }]);
      }
      setActiveRunId(null);
      setStopping(false);
      onTurnComplete?.();
    },
    [loadConversation, onTurnComplete],
  );

  const run = useRunStream(activeRunId, onRunFinished, runSeed);

  // Follow new content, but never fight a reader who scrolled up.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [isEmpty]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickRef.current) return;
    // Just after Send the scroll glides; during streaming it follows instantly.
    el.scrollTo({ top: el.scrollHeight, behavior: justSentRef.current ? "smooth" : "auto" });
  }, [messages, run.items, run.label, starting, pinned, viewportH]);

  const renderArtifact = useCallback(
    (reference: Record<string, unknown>): ReactNode => {
      const id = String(reference.id ?? "");
      const artifact = artifacts[id] ?? (reference.payload ? (reference as unknown as CopilotArtifact) : null);
      if (!artifact) return null;
      return (
        <ArtifactSurface
          artifact={artifact}
          onPrompt={(text) => void sendMessage(text)}
          expanded={expandedArtifactId === artifact.id}
          onExpand={() => setExpandedArtifactId(artifact.id)}
          onCollapse={() => setExpandedArtifactId(null)}
          onChange={(next) => setArtifacts((prev) => ({ ...prev, [next.id]: next }))}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artifacts, expandedArtifactId],
  );

  async function sendMessage(message: string) {
    if (running) return;
    setError(null);
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: message }]);
    stickRef.current = true;
    justSentRef.current = true;
    window.setTimeout(() => {
      justSentRef.current = false;
    }, 800);
    setPinned(true);
    setRunStartedAt(clockNow());
    setStarting(true);

    try {
      const context = buildContext?.();
      const outgoing = context ? `Context: ${context}\n\n---\n\n${message}` : message;
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message: outgoing }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Copilot request failed");
      if (!activeIdRef.current && data.conversationId) setActiveId(data.conversationId);
      setRunSeed(null);
      setActiveRunId(data.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copilot request failed");
    } finally {
      setStarting(false);
    }
  }

  async function stopRun() {
    if (!activeRunId || stopping) return;
    setStopping(true);
    await fetch(`/api/copilot/runs/${activeRunId}/stop`, { method: "POST" }).catch(() => undefined);
  }

  const liveLabel = stopping ? "Stopping…" : starting && !activeRunId ? "Starting…" : run.label || "Working…";

  return (
    <div className="copilot-panel relative flex h-full w-full">
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${isEmpty && emptyLayout === "center" ? "justify-center" : ""}`}>
        {isEmpty && emptyLayout === "top" ? (
          <div className="copilot-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <div className="mx-auto w-full max-w-2xl">
              {emptyHeading}
              <Composer disabled={running} busy={running} onSend={sendMessage} onStop={activeRunId ? () => void stopRun() : undefined} stopping={stopping} />
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
              {error ? <p className="mt-3 text-[13px] text-red-500">{error}</p> : null}
              {emptyFooter}
            </div>
          </div>
        ) : !isEmpty ? (
          <div ref={scrollerRef} className="copilot-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
            {(() => {
              const lastUser = pinned ? messages.map((m) => m.role).lastIndexOf("user") : -1;
              const renderMessage = (m: UIMessage) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="copilot-user-bubble w-fit max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[16px] leading-snug">{m.content}</div>
                    </div>
                  );
                }
                return <AgentTimeline key={m.id} items={m.items} renderArtifact={renderArtifact} error={m.error} />;
              };
              const live = running ? (
                <AgentTimeline
                  items={run.items}
                  live
                  label={liveLabel}
                  startedAt={runStartedAt}
                  renderArtifact={renderArtifact}
                />
              ) : null;
              if (lastUser < 0) {
                return (
                  <>
                    {messages.map(renderMessage)}
                    {live}
                  </>
                );
              }
              // The newest exchange sits in a block as tall as the window, so the question can scroll to the top with room below.
              return (
                <>
                  {messages.slice(0, lastUser).map(renderMessage)}
                  <div className="space-y-4" style={{ minHeight: Math.max(0, viewportH - 24) }}>
                    {messages.slice(lastUser).map(renderMessage)}
                    {live}
                  </div>
                </>
              );
            })()}

            {error ? <p className="text-[13px] text-red-500">{error}</p> : null}
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
              <Composer disabled={running} busy={running} onSend={sendMessage} onStop={activeRunId ? () => void stopRun() : undefined} stopping={stopping} />
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
    </div>
  );
}
