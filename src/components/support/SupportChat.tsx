"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessageCircle, X } from "lucide-react";
import { CopilotMarkdown } from "@/components/copilot/CopilotMarkdown";
import { cn } from "@/lib/cn";

type Message = {
  id: string;
  role: "user" | "assistant" | "admin";
  content: string;
  created_at?: string;
  error?: boolean;
};

const VISITOR_KEY = "apsurn-support-visitor";
const CONVERSATION_KEY = "apsurn-support-conversation";
const SUGGESTIONS = ["Connect my Gmail", "How credits work", "Create a campaign", "Emails not sending"];

function storage<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function getVisitorId(): string {
  return storage(() => {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = `${crypto.randomUUID()}${crypto.randomUUID().slice(0, 8)}`.replace(/-/g, "");
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }, "");
}

/** A short two-note ping, synthesised so no audio asset is needed. */
function playPing(context: AudioContext | null) {
  if (!context) return;
  try {
    void context.resume();
    const now = context.currentTime;
    [880, 1318.5].forEach((frequency, i) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(context.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  } catch {
    /* audio blocked */
  }
}

/** Floating help chat: AI answers from the knowledge base, with human handoff. Mounted once in the root layout. */
export function SupportChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const panelRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const visitorRef = useRef("");
  const conversationRef = useRef<string | null>(null);
  const knownIds = useRef(new Set<string>());
  const lastCreatedAt = useRef<string | null>(null);
  const endedAt = useRef<string | null>(null);
  const openRef = useRef(false);
  const tempId = useRef(0);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const prepareAudio = useCallback(() => {
    if (audioRef.current) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) audioRef.current = new Ctor();
    } catch {
      /* unsupported */
    }
  }, []);

  /** Merge server messages in; ping and badge for anything the customer hasn't seen. */
  const mergeIncoming = useCallback((incoming: Message[], opts: { announce: boolean }) => {
    const fresh = incoming.filter((m) => !knownIds.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => knownIds.current.add(m.id));
    const newest = fresh[fresh.length - 1].created_at;
    if (newest && (!lastCreatedAt.current || newest > lastCreatedAt.current)) lastCreatedAt.current = newest;
    setMessages((prev) => [...prev.filter((m) => !m.id.startsWith("tmp-") || m.role !== "user" || !fresh.some((f) => f.role === "user" && f.content === m.content)), ...fresh]);
    const replies = fresh.filter((m) => m.role !== "user");
    if (opts.announce && replies.length) {
      playPing(audioRef.current);
      if (!openRef.current) setUnread((n) => n + replies.length);
    }
  }, []);

  // Restore the saved conversation.
  useEffect(() => {
    visitorRef.current = getVisitorId();
    const saved = storage(() => localStorage.getItem(CONVERSATION_KEY), null);
    if (!saved || !visitorRef.current) return;
    conversationRef.current = saved;
    fetch(`/api/support/messages?conversationId=${saved}&visitorId=${visitorRef.current}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: { messages: Message[]; needsEmail: boolean }) => {
        mergeIncoming(data.messages, { announce: false });
        setNeedsEmail(data.needsEmail);
      })
      .catch((status) => {
        if (status === 404) {
          conversationRef.current = null;
          storage(() => localStorage.removeItem(CONVERSATION_KEY), undefined);
        }
      });
  }, [mergeIncoming]);

  // Poll for admin replies, even while the panel is closed.
  useEffect(() => {
    if (!messages.length) return;
    const interval = window.setInterval(
      async () => {
        const id = conversationRef.current;
        if (!id || document.visibilityState !== "visible") return;
        const after = lastCreatedAt.current ? `&after=${encodeURIComponent(lastCreatedAt.current)}` : "";
        try {
          const res = await fetch(`/api/support/messages?conversationId=${id}&visitorId=${visitorRef.current}${after}`);
          if (!res.ok) return;
          const data = (await res.json()) as { messages: Message[]; needsEmail: boolean };
          mergeIncoming(data.messages, { announce: true });
          setNeedsEmail(data.needsEmail);
        } catch {
          /* offline */
        }
      },
      open ? 7000 : 15000,
    );
    return () => window.clearInterval(interval);
  }, [open, messages.length, mergeIncoming]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, busy, needsEmail]);

  /** Tell the server the visit ended so it emails the transcript to the team (once). */
  const endChat = useCallback(() => {
    const id = conversationRef.current;
    if (!id || !visitorRef.current || endedAt.current === lastCreatedAt.current) return;
    endedAt.current = lastCreatedAt.current;
    const payload = JSON.stringify({ conversationId: id, visitorId: visitorRef.current });
    try {
      if (!navigator.sendBeacon?.("/api/support/end", new Blob([payload], { type: "text/plain" }))) {
        void fetch("/api/support/end", { method: "POST", body: payload, keepalive: true });
      }
    } catch {
      /* best effort */
    }
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    endChat();
  }, [endChat]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || launcherRef.current?.contains(target)) return;
      closePanel();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, closePanel]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") endChat();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", endChat);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", endChat);
    };
  }, [endChat]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    prepareAudio();
    const temp: Message = { id: `tmp-${++tempId.current}`, role: "user", content };
    setMessages((prev) => [...prev, temp]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationRef.current,
          visitorId: visitorRef.current,
          message: content,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        conversationId?: string;
        messages?: Message[];
        needsEmail?: boolean;
      } | null;
      if (data?.conversationId && data.conversationId !== conversationRef.current) {
        conversationRef.current = data.conversationId;
        endedAt.current = null;
        storage(() => localStorage.setItem(CONVERSATION_KEY, data.conversationId!), undefined);
      }
      if (data?.messages) {
        setMessages((prev) => prev.filter((m) => m.id !== temp.id));
        knownIds.current.delete(temp.id);
        mergeIncoming(data.messages, { announce: true });
      }
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      setNeedsEmail(Boolean(data?.needsEmail));
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${++tempId.current}`,
          role: "assistant",
          error: true,
          content: error instanceof Error ? error.message : "Something went wrong. Please email hello@apsurn.com.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setEmailError(null);
    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationRef.current, visitorId: visitorRef.current, email }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; messages?: Message[] } | null;
      if (!res.ok) throw new Error(data?.error || "Could not save your email.");
      mergeIncoming(data?.messages ?? [], { announce: true });
      setNeedsEmail(false);
      setEmail("");
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Could not save your email.");
    }
  }

  function toggle() {
    prepareAudio();
    if (open) {
      closePanel();
    } else {
      setOpen(true);
      setUnread(0);
    }
  }

  // Public shared pages belong to the customer, not to Apsurn support.
  if (pathname.startsWith("/p/")) return null;

  return (
    <div className="support-chat-root fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 sm:bottom-5 sm:right-5">
      {open ? (
        <section
          ref={panelRef}
          role="dialog"
          aria-label="Apsurn support"
          className="flex h-[min(32rem,calc(100vh-6.5rem))] w-[calc(100vw-2rem)] max-w-[21rem] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_32px_rgba(0,0,0,0.16)] ring-1 ring-black/5 sm:w-[21rem]"
        >
          <header className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3.5">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-neutral-900">Support</p>
              <p className="text-[11px] text-neutral-400">AI assistant, with the team behind it</p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close support chat"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="size-4" />
            </button>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            <p className="text-[13.5px] leading-snug text-neutral-600">
              Hi, ask me anything about how Apsurn works and I&apos;ll point you to the right screen.
            </p>
            {messages.length === 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                    className="rounded-full bg-neutral-100 px-3 py-1.5 text-[12.5px] text-neutral-700 hover:bg-neutral-200/80"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#4379EE] px-3 py-2 text-[13.5px] leading-snug text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="max-w-[92%]">
                  {m.role === "admin" ? (
                    <p className="mb-0.5 pl-1 text-[11px] font-medium text-[#4379EE]">Apsurn team</p>
                  ) : null}
                  <div
                    className={cn(
                      "rounded-2xl rounded-tl-md px-3 py-2",
                      m.error
                        ? "bg-red-50 text-[13.5px] text-red-700"
                        : "bg-neutral-100 text-neutral-800 [&_.copilot-md]:text-[13.5px] [&_.copilot-md]:leading-snug",
                    )}
                  >
                    {m.error ? m.content : <CopilotMarkdown content={m.content} />}
                  </div>
                </div>
              ),
            )}
            {busy ? (
              <div className="flex w-fit gap-1 rounded-2xl rounded-tl-md bg-neutral-100 px-3 py-3" aria-label="Thinking">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-bounce rounded-full bg-neutral-400"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            ) : null}
            {needsEmail ? (
              <form onSubmit={submitEmail} className="rounded-xl bg-neutral-100 p-2.5">
                <p className="mb-1.5 text-[12px] text-neutral-600">Your personal email, so the team can reach you:</p>
                <div className="flex gap-1.5">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    aria-label="Your email"
                    className="min-w-0 flex-1 rounded-lg bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-[#4379EE] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#3567D6]"
                  >
                    Send
                  </button>
                </div>
                {emailError ? <p className="mt-1.5 text-[12px] text-red-600">{emailError}</p> : null}
              </form>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="shrink-0 px-3 pb-3 pt-1"
          >
            <div className="flex items-center gap-2 rounded-full bg-neutral-100 py-1 pl-4 pr-1">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={1000}
                placeholder="Ask a question…"
                aria-label="Your question"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#4379EE] text-white hover:bg-[#3567D6] disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        onClick={toggle}
        aria-label={open ? "Close support chat" : unread ? `Open support chat, ${unread} new` : "Open support chat"}
        aria-expanded={open}
        className="relative inline-flex size-12 items-center justify-center rounded-full bg-[#4379EE] text-white shadow-[0_6px_20px_rgba(67,121,238,0.45)] transition-transform hover:scale-105 hover:bg-[#3567D6]"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
        {!open && unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold leading-5 text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
    </div>
  );
}
