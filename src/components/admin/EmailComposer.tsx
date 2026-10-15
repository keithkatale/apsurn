"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

type Mode = "broadcast" | "individual";

interface Props {
  mode: Mode;
  /** Required for a one-to-one email. */
  userId?: string;
  recipientLabel?: string;
}

const REPLY_TO = "keith@apsurn.com";

const INPUT = "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#4379EE]";

export function EmailComposer({ mode, userId, recipientLabel }: Props) {
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [preheader, setPreheader] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [audience, setAudience] = useState<number | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "test" | "send">(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const ready = subject.trim() && title.trim() && body.trim();

  async function call(action: "preview" | "audience" | "send", sendMode: "broadcast" | "individual" | "test" = mode) {
    const res = await fetch("/api/admin/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        mode: sendMode,
        ...(userId ? { userId } : {}),
        subject,
        title,
        body,
        ...(ctaLabel.trim() ? { ctaLabel } : {}),
        ...(ctaUrl.trim() ? { ctaUrl } : {}),
        ...(preheader.trim() ? { preheader } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong.");
    return data;
  }

  async function preview() {
    setBusy("preview");
    setMessage(null);
    try {
      const data = await call("preview");
      setPreviewHtml(String(data.html ?? ""));
      if (mode === "broadcast") setAudience(Number((await call("audience")).count ?? 0));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not preview." });
    } finally {
      setBusy(null);
    }
  }

  async function send(sendMode: "broadcast" | "individual" | "test") {
    setBusy(sendMode === "test" ? "test" : "send");
    setMessage(null);
    try {
      const data = await call("send", sendMode);
      const sent = Number(data.sent ?? 0);
      const failed = Number(data.failed ?? 0);
      if (typeof data.error === "string" && sent === 0) throw new Error(data.error);
      setMessage({
        kind: failed > 0 ? "error" : "ok",
        text:
          sendMode === "test"
            ? "Test sent to you. Check your inbox."
            : `Sent to ${sent} ${sent === 1 ? "person" : "people"}${failed ? `, ${failed} failed${typeof data.error === "string" ? `: ${data.error}` : ""}` : ""}.`,
      });
      setConfirming(false);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not send." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <p className="text-[13px] text-neutral-500">
          {mode === "broadcast" ? "To: everyone with an account who has not unsubscribed." : `To: ${recipientLabel}`} Replies go to {REPLY_TO}. Use{" "}
          <code className="rounded bg-neutral-100 px-1">{"{{first_name}}"}</code> to greet each person by name.
        </p>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-neutral-600">Subject</span>
          <input className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Your campaigns are waiting, {{first_name}}" maxLength={200} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-neutral-600">Headline inside the email</span>
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pick up where you left off" maxLength={200} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-neutral-600">Message (blank line = new paragraph)</span>
          <textarea className={`${INPUT} min-h-[11rem] resize-y leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Hi {{first_name}},\n\nYou set up your first campaign but haven't sent it yet…"} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-neutral-600">Button label (optional)</span>
            <input className={INPUT} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Open my campaign" maxLength={60} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-neutral-600">Button link</span>
            <input className={INPUT} value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://apsurn.com/dashboard/campaigns" maxLength={500} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-neutral-600">Preview text in the inbox (optional)</span>
          <input className={INPUT} value={preheader} onChange={(e) => setPreheader(e.target.value)} maxLength={200} />
        </label>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" disabled={!ready || busy !== null} onClick={() => void preview()} className="h-10 rounded-lg bg-white px-4 text-sm font-medium text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-100 disabled:opacity-50">
            {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : "Preview"}
          </button>
          <button type="button" disabled={!ready || busy !== null} onClick={() => void send("test")} className="h-10 rounded-lg bg-white px-4 text-sm font-medium text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-100 disabled:opacity-50">
            {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : "Send me a test"}
          </button>
          {mode === "individual" ? (
            <button type="button" disabled={!ready || busy !== null} onClick={() => void send("individual")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#4379EE] px-4 text-sm font-medium text-white hover:bg-[#3567D6] disabled:opacity-50">
              {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
            </button>
          ) : confirming ? (
            <>
              <button type="button" disabled={busy !== null} onClick={() => void send("broadcast")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Yes, send to {audience ?? "everyone"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="h-10 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100">
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!ready || busy !== null}
              onClick={() => {
                setConfirming(true);
                void call("audience").then((d) => setAudience(Number(d.count ?? 0))).catch(() => {});
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#4379EE] px-4 text-sm font-medium text-white hover:bg-[#3567D6] disabled:opacity-50"
            >
              <Send className="size-4" /> Send to everyone
            </button>
          )}
        </div>
        {message ? <p className={`text-sm ${message.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p> : null}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-2">
        {previewHtml ? (
          <iframe title="Email preview" srcDoc={previewHtml} className="h-[42rem] w-full rounded-lg" sandbox="" />
        ) : (
          <div className="flex h-[42rem] items-center justify-center px-6 text-center text-sm text-neutral-400">
            Fill in the email and press Preview to see exactly how it will look.
          </div>
        )}
      </div>
    </div>
  );
}
