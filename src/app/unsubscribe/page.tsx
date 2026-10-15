"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function UnsubscribeForm() {
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const u = params.get("u") ?? "";
  const t = params.get("t") ?? "";

  async function confirm() {
    setState("busy");
    try {
      const res = await fetch(`/api/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="font-heading text-2xl font-semibold text-neutral-900">
        {state === "done" ? "You're unsubscribed" : "Unsubscribe from product emails?"}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
        {state === "done"
          ? "You won't get product news or announcements from apsurn any more. Account emails like sign-in codes still arrive."
          : "You'll stop getting product news and announcements from apsurn. Account emails like sign-in codes still arrive."}
      </p>
      {state === "error" ? <p className="mt-3 text-sm text-red-600">That link didn&apos;t work. Reply to any apsurn email and we&apos;ll do it for you.</p> : null}
      {state !== "done" ? (
        <button
          type="button"
          disabled={state === "busy" || !u || !t}
          onClick={() => void confirm()}
          className="mx-auto mt-6 h-11 rounded-xl bg-[#4379EE] px-6 text-sm font-medium text-white hover:bg-[#3567D6] disabled:opacity-60"
        >
          {state === "busy" ? "Working…" : "Yes, unsubscribe me"}
        </button>
      ) : null}
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeForm />
    </Suspense>
  );
}
