"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function RunSendPassButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/outreach/send-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: true, limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send pass failed");
      setMessage(
        `Opened ${data.opened ?? 0} · skipped ${data.skipped ?? 0} · failed ${data.failed ?? 0}` +
          (data.holding ? ` (${data.holding})` : "")
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Send pass failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ThreeDButton type="button" variant="soft" size="sm" disabled={busy} onClick={run}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        <span>{busy ? "Sending…" : "Run send pass"}</span>
      </ThreeDButton>
      {message && <p className="max-w-xs text-right text-[11px] text-neutral-500">{message}</p>}
    </div>
  );
}
