"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";

export function Composer({ disabled, busy, onSend }: { disabled: boolean; busy: boolean; onSend: (message: string) => void }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSubmitDisabled = disabled || !value.trim();

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22;
    const maxHeight = lineHeight * 4 + 8;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value]);

  function submit() {
    if (isSubmitDisabled) return;
    onSend(value.trim());
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit();
  }

  const sendButtonClass = (extra: string) =>
    `inline-flex size-8 shrink-0 items-center justify-center rounded-full transition ${
      isSubmitDisabled
        ? "cursor-not-allowed bg-[var(--copilot-dropdown-hover)] text-[var(--copilot-muted)] opacity-60"
        : "bg-neutral-900 text-white hover:opacity-90"
    } ${extra}`;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className={`prompt-glow group relative flex w-full flex-col ${busy ? "is-busy" : ""}`}>
        <span className="prompt-glow-spin" aria-hidden />
        <div
          className="prompt-glow-inner"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            textareaRef.current?.focus();
          }}
        >
          <div className="flex flex-col gap-1 p-1.5">
            <div className="flex items-end gap-1">
              <textarea
                ref={textareaRef}
                rows={1}
                value={value}
                disabled={disabled}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Copilot about your prospects, contacts, or sequences…"
                aria-label="Message input"
                className="max-h-24 min-h-8 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[13px] leading-[22px] text-[var(--copilot-foreground)] outline-none placeholder:text-[var(--copilot-muted)] md:w-full"
              />
              <button
                type="submit"
                disabled={isSubmitDisabled}
                aria-label={busy ? "Waiting for response" : "Send message"}
                className={sendButtonClass("mb-0.5 md:hidden")}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} /> : <ArrowUp className="size-3.5" strokeWidth={2.5} />}
              </button>
            </div>

            <div className="hidden items-center justify-end gap-2 px-0.5 pb-0.5 md:flex">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                aria-label={busy ? "Waiting for response" : "Send message"}
                className={sendButtonClass("")}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} /> : <ArrowUp className="size-3.5" strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
