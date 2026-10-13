"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import type { TimelineItem } from "@/lib/agents/timeline";
import { CopilotMarkdown } from "../CopilotMarkdown";
import { ToolRow } from "./ToolRow";
import { formatElapsed } from "./tool-phrases";
import "./timeline.css";

function Reasoning_({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  return (
    <div className="cpt-reasoning">
      <p className={!live && !open && long ? "line-clamp-3" : undefined}>{text}</p>
      {!live && long ? (
        <button type="button" onClick={() => setOpen((value) => !value)} className="mt-0.5 text-[12px] underline-offset-2 hover:underline">
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

/** Seconds since the run began, ticking while it is live. */
function useElapsed(startedAt: number | undefined, live: boolean): number {
  const [now, setNow] = useState(() => startedAt ?? 0);
  useEffect(() => {
    if (!live) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  return live && startedAt ? Math.max(0, now - startedAt) : 0;
}

/** The work (thinking and tool calls) lives in a short window that scrolls inside itself, so a long run never pushes the answer out of view. */
function WorkWindow({ children, live, itemCount }: { children: ReactNode; live: boolean; itemCount: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Follow the newest step inside the window only; the page itself is never scrolled from here.
  useEffect(() => {
    const el = ref.current;
    if (el && live && stick.current) el.scrollTop = el.scrollHeight;
  }, [live, itemCount, children]);

  return (
    <div ref={ref} className="cpt-window">
      <div className="cpt-window-inner">{children}</div>
    </div>
  );
}

function workSummary(work: TimelineItem[]): string {
  const tools = work.filter((item): item is Extract<TimelineItem, { kind: "tool" }> => item.kind === "tool");
  const failed = tools.filter((tool) => tool.status === "failed").length;
  const ms = tools.reduce((sum, tool) => sum + (tool.ms ?? 0), 0);
  const parts = [tools.length === 0 ? "Thought it through" : `${tools.length} action${tools.length === 1 ? "" : "s"}`];
  if (failed) parts.push(`${failed} failed`);
  if (ms >= 1000) parts.push(formatElapsed(ms));
  return parts.join(" · ");
}

export function AgentTimeline({
  items,
  live = false,
  label = "",
  startedAt,
  renderArtifact,
  error,
}: {
  items: TimelineItem[];
  live?: boolean;
  label?: string;
  startedAt?: number;
  renderArtifact: (artifact: Record<string, unknown>) => ReactNode;
  error?: string | null;
}) {
  // The answer is the text after the last tool or card. Everything before it is the work: thinking, tool calls and
  // narration, which live inside the Reasoning block instead of filling the chat.
  const lastWorkIndex = items.reduce((last, item, index) => (item.kind === "tool" || item.kind === "artifact" ? index : last), -1);
  const answerStart = items.findIndex((item, index) => index > lastWorkIndex && item.kind === "text" && item.text.trim() !== "");
  const answer = answerStart === -1 ? [] : items.slice(answerStart).filter((item) => item.kind === "text" && item.text.trim() !== "");
  const beforeAnswer = answerStart === -1 ? items : items.slice(0, answerStart);
  const cards = beforeAnswer.filter((item): item is Extract<TimelineItem, { kind: "artifact" }> => item.kind === "artifact");
  const work = beforeAnswer.filter((item) => item.kind !== "artifact");
  const hasWork = work.some((item) => item.kind === "tool" || ("text" in item && item.text.trim() !== ""));
  const lastToolId = [...work].reverse().find((item) => item.kind === "tool")?.id;
  const elapsed = useElapsed(startedAt, live);

  const message = (streaming: boolean) =>
    streaming ? (
      <>
        {label || "Working…"} <span className="tabular-nums opacity-70">{formatElapsed(elapsed)}</span>
      </>
    ) : (
      workSummary(work)
    );

  return (
    <div className="cpt">
      {live || hasWork ? (
        <Reasoning isStreaming={live}>
          <div className="flex items-center gap-2">
            <ReasoningTrigger getThinkingMessage={(streaming) => message(streaming)} />
          </div>
          <ReasoningContent>
            {hasWork ? (
              <WorkWindow live={live} itemCount={work.length}>
                {work.map((item, index) => {
                  if (item.kind === "reasoning") return item.text.trim() ? <Reasoning_ key={item.id} text={item.text} live={live && index === work.length - 1} /> : null;
                  if (item.kind === "tool") return <ToolRow key={item.id} tool={item} latest={item.id === lastToolId} />;
                  if (item.kind === "text" && item.text.trim()) {
                    return (
                      <div key={item.id} className="cpt-narration">
                        <CopilotMarkdown content={item.text} caret={live && index === work.length - 1} />
                      </div>
                    );
                  }
                  return null;
                })}
              </WorkWindow>
            ) : null}
          </ReasoningContent>
        </Reasoning>
      ) : null}

      {cards.map((item) => (
        <div key={item.id}>{renderArtifact(item.artifact)}</div>
      ))}

      {answer.map((item, index) =>
        item.kind === "text" ? (
          <div key={item.id}>
            <CopilotMarkdown content={item.text} caret={live && index === answer.length - 1} />
          </div>
        ) : null,
      )}

      {items
        .slice(answerStart === -1 ? items.length : answerStart)
        .filter((item) => item.kind === "artifact")
        .map((item) => (item.kind === "artifact" ? <div key={item.id}>{renderArtifact(item.artifact)}</div> : null))}

      {error ? <p className="cpt-error text-[13px]">{error}</p> : null}
    </div>
  );
}
