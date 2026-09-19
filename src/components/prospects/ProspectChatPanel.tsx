"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import { CopilotMarkdown } from "@/components/copilot/CopilotMarkdown";
import { AgentActivityItem, type AgentActivityItemData } from "@/components/prospects/AgentActivity";

type Item = ({ id: string; kind: "text"; text: string }) | ({ id: string; kind: "tool" } & AgentActivityItemData);

interface ChatTurn {
  id: string;
  userText: string;
  assistantReply: string | null;
  items: Item[];
  summary: { found: number; contactCount: number; warnings: number } | null;
  error: string | null;
  status: "interpreting" | "clarifying" | "running" | "done" | "error";
}

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `item-${Date.now()}-${uidCounter}`;
}

export function ProspectChatPanel({
  onLeadSaved,
  onRunFinished,
}: {
  onLeadSaved?: () => void;
  onRunFinished?: () => void;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HistoryMessage[]>([]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns]);

  function updateTurn(id: string, patch: Partial<ChatTurn>) {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);

    historyRef.current = [...historyRef.current, { role: "user", content: text }];

    const turnId = uid();
    setTurns((prev) => [
      ...prev,
      { id: turnId, userText: text, assistantReply: null, items: [], summary: null, error: null, status: "interpreting" },
    ]);

    try {
      const interpretRes = await fetch("/api/prospecting/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyRef.current }),
      });
      const interpreted = await interpretRes.json().catch(() => ({}));
      if (!interpretRes.ok) throw new Error(interpreted.error ?? "Could not understand that request");

      historyRef.current = [...historyRef.current, { role: "assistant", content: interpreted.reply ?? "" }];

      if (!interpreted.ready) {
        updateTurn(turnId, { assistantReply: interpreted.reply ?? null, status: "clarifying" });
        setBusy(false);
        return;
      }

      updateTurn(turnId, { assistantReply: interpreted.reply ?? null, status: "running" });

      const controller = new AbortController();
      abortRef.current = controller;
      const criteria = interpreted.criteria ?? {};

      const res = await fetch("/api/prospecting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          version: 1,
          limit: criteria.limit ?? 15,
          criteria: {
            industries: criteria.industries ?? [],
            geographies: criteria.geographies ?? [],
            companySizeRange: criteria.companySizeRange ?? "",
            personas: criteria.personas ?? [],
          },
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Prospecting failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminalEvent = false;
      const local: Item[] = [];

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
            case "token": {
              const last = local[local.length - 1];
              if (last && last.kind === "text") last.text += event.text;
              else local.push({ id: uid(), kind: "text", text: event.text });
              updateTurn(turnId, { items: [...local] });
              break;
            }
            case "tool_start": {
              local.push({ id: uid(), kind: "tool", name: event.name, status: "running", args: event.args ?? {} });
              updateTurn(turnId, { items: [...local] });
              break;
            }
            case "tool_end": {
              for (let i = local.length - 1; i >= 0; i--) {
                const it = local[i];
                if (it.kind === "tool" && it.name === event.name && it.status === "running") {
                  local[i] = { ...it, status: "done", result: event.result };
                  break;
                }
              }
              updateTurn(turnId, { items: [...local] });
              if (event.name === "save_lead" && (event.result as { saved?: boolean } | undefined)?.saved) {
                onLeadSaved?.();
              }
              break;
            }
            case "done": {
              sawTerminalEvent = true;
              updateTurn(turnId, {
                summary: { found: event.found, contactCount: event.contactCount, warnings: event.warnings },
                status: "done",
              });
              onRunFinished?.();
              break;
            }
            case "error": {
              sawTerminalEvent = true;
              updateTurn(turnId, { error: event.error, status: "error" });
              break;
            }
          }
        }
      }
      if (!sawTerminalEvent) updateTurn(turnId, { status: "done" });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        updateTurn(turnId, { status: "done" });
      } else {
        updateTurn(turnId, { error: err instanceof Error ? err.message : "Prospecting failed", status: "error" });
      }
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3 pr-10">
        <h1 className="text-sm font-semibold text-neutral-900">Talk to the AI</h1>
        <p className="text-xs text-neutral-500">Tell it who you&apos;re looking for — it&apos;ll ask questions before it starts searching.</p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <p className="text-sm text-neutral-400">e.g. &ldquo;I want to find more customers for my product&rdquo;</p>
        )}
        <div className="flex flex-col gap-4">
          {turns.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-2">
              <div className="self-end rounded-2xl bg-neutral-900 px-3 py-1.5 text-[13px] text-white">{turn.userText}</div>

              <div className="flex flex-col gap-2.5">
                {turn.status === "interpreting" && (
                  <div className="copilot-typing" aria-label="Thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                )}

                {turn.assistantReply && (
                  <div className="self-start rounded-2xl bg-neutral-100 px-3 py-1.5 text-[13px] text-neutral-800">
                    {turn.assistantReply}
                  </div>
                )}

                {turn.items.map((item) =>
                  item.kind === "tool" ? (
                    <AgentActivityItem key={item.id} item={item} />
                  ) : (
                    <div key={item.id} className="py-1">
                      <CopilotMarkdown content={item.text} />
                    </div>
                  )
                )}

                {turn.error && <p className="text-sm text-red-600">{turn.error}</p>}

                {turn.summary && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-[13px] text-neutral-700">
                    Found {turn.summary.found} compan{turn.summary.found === 1 ? "y" : "ies"} · {turn.summary.contactCount}{" "}
                    contact{turn.summary.contactCount === 1 ? "" : "s"}
                    {turn.summary.warnings > 0 ? ` · ${turn.summary.warnings} skipped` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={send} className="flex shrink-0 items-center gap-2 border-t border-neutral-200 bg-white p-3">
        <input
          className="input flex-1"
          placeholder="Describe who you're looking for…"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
        />
        {busy ? (
          <button
            type="button"
            onClick={stop}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700"
            aria-label="Stop"
          >
            <Square className="size-3.5" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim()}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="size-4" />
          </button>
        )}
      </form>
    </div>
  );
}
