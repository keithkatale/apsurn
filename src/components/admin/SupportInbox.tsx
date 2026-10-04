"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";

type Summary = {
  id: string;
  email: string | null;
  signedIn: boolean;
  status: "open" | "needs_human" | "answered" | "closed";
  needsEmail: boolean;
  lastMessageAt: string;
  lastMessage: { role: string; content: string } | null;
  unread: boolean;
};

type Message = { id: string; role: "user" | "assistant" | "admin"; content: string; created_at: string };

const STATUS_LABEL: Record<Summary["status"], string> = {
  open: "AI handling",
  needs_human: "Needs a person",
  answered: "Answered",
  closed: "Closed",
};

const STATUS_STYLE: Record<Summary["status"], string> = {
  open: "bg-neutral-100 text-neutral-600",
  needs_human: "bg-amber-50 text-amber-800",
  answered: "bg-emerald-50 text-emerald-700",
  closed: "bg-neutral-100 text-neutral-400",
};

function ago(iso: string) {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SupportInbox({ initialId }: { initialId?: string }) {
  const [list, setList] = useState<Summary[]>([]);
  const [filter, setFilter] = useState<"active" | "closed" | "all">("active");
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/support", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 403 ? "Not authorized" : "Could not load conversations");
      const data = (await res.json()) as { conversations: Summary[] };
      setList(data.conversations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load conversations");
    }
  }, []);

  const loadThread = useCallback(async (id: string, reset: boolean) => {
    const after = !reset && lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : "";
    const res = await fetch(`/api/admin/support/${id}${after}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { messages: Message[] };
    if (reset) setMessages(data.messages);
    else if (data.messages.length) {
      setMessages((prev) => [...prev, ...data.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
    }
    const newest = data.messages[data.messages.length - 1]?.created_at;
    if (newest) lastAt.current = newest;
    else if (reset) lastAt.current = null;
  }, []);

  useEffect(() => {
    void loadList();
    const t = window.setInterval(() => void loadList(), 10000);
    return () => window.clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    lastAt.current = null;
    void loadThread(selectedId, true).then(() => void loadList());
    const t = window.setInterval(() => void loadThread(selectedId, false), 5000);
    return () => window.clearInterval(t);
  }, [selectedId, loadThread, loadList]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const selected = list.find((c) => c.id === selectedId) ?? null;
  const visible = list.filter((c) =>
    filter === "all" ? true : filter === "closed" ? c.status === "closed" : c.status !== "closed",
  );

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    const content = reply.trim();
    if (!content || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Could not send");
      const data = (await res.json()) as { message: Message };
      setMessages((prev) => [...prev, data.message]);
      lastAt.current = data.message.created_at;
      setReply("");
      void loadList();
    } catch {
      setError("Could not send that reply. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: "open" | "closed") {
    if (!selectedId) return;
    await fetch(`/api/admin/support/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    void loadList();
  }

  const needsPerson = list.filter((c) => c.status === "needs_human").length;

  return (
    <div className="grid h-[calc(100vh-9rem)] min-h-[28rem] grid-cols-1 gap-4 md:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
          <div className="flex gap-1">
            {(["active", "closed", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[12px] font-medium capitalize",
                  filter === f ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:text-neutral-900",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          {needsPerson > 0 ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              {needsPerson} waiting
            </span>
          ) : null}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {visible.length === 0 ? (
            <li className="px-3 py-6 text-center text-[13px] text-neutral-500">No conversations.</li>
          ) : null}
          {visible.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left",
                  c.id === selectedId ? "bg-neutral-100" : "hover:bg-neutral-50",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {c.unread ? <span className="size-2 shrink-0 rounded-full bg-[#4379EE]" aria-label="Unread" /> : null}
                    <span className="truncate text-[13px] font-medium text-neutral-900">
                      {c.email ?? "Anonymous visitor"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-neutral-400">{ago(c.lastMessageAt)}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-neutral-500">
                  {c.lastMessage ? c.lastMessage.content : "No messages"}
                </span>
                <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[c.status])}>
                  {STATUS_LABEL[c.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-col rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-neutral-500">
            Select a conversation to read and reply.
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-neutral-900">{selected?.email ?? "Anonymous visitor"}</p>
                <p className="text-[12px] text-neutral-500">
                  {selected?.signedIn ? "Signed in" : "Not signed in"}
                  {selected?.needsEmail ? " · waiting for their email" : ""}
                </p>
              </div>
              {selected ? (
                <button
                  type="button"
                  onClick={() => void setStatus(selected.status === "closed" ? "open" : "closed")}
                  className="shrink-0 rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-200/80"
                >
                  {selected.status === "closed" ? "Reopen" : "Mark closed"}
                </button>
              ) : null}
            </header>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-2">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "admin" ? "justify-end" : "justify-start")}>
                  <div className="max-w-[80%]">
                    <p className={cn("mb-0.5 px-1 text-[11px] text-neutral-400", m.role === "admin" && "text-right")}>
                      {m.role === "user" ? "Customer" : m.role === "admin" ? "You" : "AI assistant"} · {ago(m.created_at)}
                    </p>
                    <div
                      className={cn(
                        "whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13.5px] leading-snug",
                        m.role === "admin"
                          ? "rounded-br-md bg-[#4379EE] text-white"
                          : m.role === "assistant"
                            ? "rounded-tl-md bg-neutral-50 text-neutral-600"
                            : "rounded-tl-md bg-neutral-100 text-neutral-900",
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={sendReply} className="shrink-0 px-4 pb-4 pt-2">
              <div className="flex items-end gap-2 rounded-2xl bg-neutral-100 px-3 py-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply(e);
                    }
                  }}
                  rows={2}
                  placeholder={selected?.email ? `Reply to ${selected.email}…` : "Reply…"}
                  aria-label="Reply"
                  className="min-h-10 flex-1 resize-none bg-transparent text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400"
                />
                <button
                  type="submit"
                  disabled={sending || !reply.trim()}
                  className="shrink-0 rounded-full bg-[#4379EE] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#3567D6] disabled:opacity-40"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[11px] text-neutral-400">
                The customer sees this in the chat bubble. If they&apos;ve left, it&apos;s also emailed to {selected?.email ?? "them once they share an email"}.
              </p>
            </form>
          </>
        )}
        {error ? <p className="px-4 pb-3 text-[12px] text-red-600">{error}</p> : null}
      </section>
    </div>
  );
}
