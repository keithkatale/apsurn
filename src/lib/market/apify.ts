const APIFY_API = "https://api.apify.com/v2";
const DEFAULT_TIMEOUT_MS = 180_000;
const POLL_MS = 3_000;
const MAX_CONCURRENT = 2;

export const ACTORS = {
  reddit: "automation-lab/reddit-scraper",
  twitter: "automation-lab/twitter-scraper",
  twitterSearch: "dami_studio/twitter-search-scraper",
  linkedinProfile: "harvestapi/linkedin-profile-posts",
  linkedinSearch: "harvestapi/linkedin-post-search",
} as const;

let active = 0;
const waiters: Array<() => void> = [];

function apifyToken(): string {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    throw new Error("APIFY_TOKEN is not configured. Add it to .env.local to scan Reddit, X, and LinkedIn.");
  }
  return token;
}

function actorPath(actorId: string): string {
  return actorId.replace("/", "~");
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ApifyRun {
  id: string;
  status: string;
  statusMessage?: string;
  defaultDatasetId?: string;
}

async function apifyFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${APIFY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apifyToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  return response;
}

async function startRun(actorId: string, input: Record<string, unknown>): Promise<ApifyRun> {
  const response = await apifyFetch(`/acts/${actorPath(actorId)}/runs?waitForFinish=55`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => ({}))) as { data?: ApifyRun; error?: { message?: string } };
  if (!response.ok || !body.data) {
    if (response.status === 402) {
      throw new Error("Apify spending limit reached. Add credits or wait for the monthly free allowance to reset.");
    }
    throw new Error(body.error?.message || `Apify ${actorId} failed to start (${response.status}).`);
  }
  return body.data;
}

async function getRun(runId: string): Promise<ApifyRun> {
  const response = await apifyFetch(`/actor-runs/${runId}`);
  const body = (await response.json().catch(() => ({}))) as { data?: ApifyRun; error?: { message?: string } };
  if (!response.ok || !body.data) {
    throw new Error(body.error?.message || `Could not read Apify run ${runId}.`);
  }
  return body.data;
}

async function listItems<T>(datasetId: string): Promise<T[]> {
  const response = await apifyFetch(`/datasets/${datasetId}/items?clean=1`);
  if (!response.ok) {
    throw new Error(`Could not read Apify dataset ${datasetId} (${response.status}).`);
  }
  const items = (await response.json()) as unknown;
  return Array.isArray(items) ? (items as T[]) : [];
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

/**
 * Starts one Apify actor, waits for it to finish, and returns dataset items.
 * Concurrent runs are capped so a multi-source scan cannot stampede the
 * free-tier budget.
 */
export async function runApifyActor<T>(
  actorId: string,
  input: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T[]> {
  return withSlot(async () => {
    const started = Date.now();
    let run = await startRun(actorId, input);

    while (!TERMINAL.has(run.status)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`${actorId} timed out after ${Math.round(timeoutMs / 1000)}s.`);
      }
      await sleep(POLL_MS);
      run = await getRun(run.id);
    }

    if (run.status !== "SUCCEEDED") {
      throw new Error(run.statusMessage || `${actorId} ${run.status.toLowerCase()}.`);
    }
    if (!run.defaultDatasetId) return [];
    return listItems<T>(run.defaultDatasetId);
  });
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
