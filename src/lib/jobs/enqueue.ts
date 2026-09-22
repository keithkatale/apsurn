import { after } from "next/server";

/**
 * Continue work after the HTTP response is sent (Next.js `after`).
 * Used when INTERNAL_APP_URL / NEXT_PUBLIC_APP_URL is not set.
 */
export function runAfterResponse(task: () => Promise<unknown>) {
  after(() =>
    task().catch((error) => {
      console.error("[jobs]", error instanceof Error ? error.message : error);
    }),
  );
}

/**
 * Start a job on a new Cloud Run request so CPU stays allocated after this
 * handler returns. Falls back to `after()` in local/dev without a public URL.
 */
export function enqueueInternalJob(path: string, body: unknown, localTask: () => Promise<unknown>) {
  const base = (process.env.INTERNAL_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET?.trim();

  if (!base || !secret) {
    runAfterResponse(localTask);
    return;
  }

  void fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).catch((error) => {
    console.error("[jobs] enqueue failed", path, error instanceof Error ? error.message : error);
    runAfterResponse(localTask);
  });
}
