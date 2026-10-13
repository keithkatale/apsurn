/**
 * Buffers run events and writes them in batches. Model text arrives a few characters at a time; writing each delta
 * would flood the database, so consecutive text (or reasoning) is merged and flushed on a short timer. Anything else
 * (a tool starting, an error) flushes right away so the chat sees it without delay. Pure, so it runs under node:test.
 */
import type { RunEvent } from "./run-events.ts";

export interface Batcher {
  push(event: RunEvent): void;
  /** Write everything buffered now and wait for all writes to finish. */
  flush(): Promise<void>;
}

export function createBatcher(options: {
  write: (events: RunEvent[]) => Promise<void>;
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): Batcher {
  const delayMs = options.delayMs ?? 250;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let buffer: RunEvent[] = [];
  let timer: unknown = null;
  // Writes run one after another so events land in the order they were pushed.
  let chain: Promise<void> = Promise.resolve();

  function drain(): Promise<void> {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    const batch = buffer;
    buffer = [];
    if (batch.length > 0) chain = chain.then(() => options.write(batch)).catch(() => undefined);
    return chain;
  }

  return {
    push(event) {
      const last = buffer[buffer.length - 1];
      if ((event.type === "text" || event.type === "reasoning") && last?.type === event.type) {
        buffer[buffer.length - 1] = { ...last, text: (last as { text: string }).text + event.text } as RunEvent;
      } else {
        buffer.push(event);
      }
      if (event.type === "text" || event.type === "reasoning") {
        if (timer === null) timer = setTimer(() => void drain(), delayMs);
      } else {
        void drain();
      }
    },
    flush: drain,
  };
}
