export type RadarSourceId =
  | "hn_intent"
  | "hn_hiring"
  | "ats_hiring"
  | "sec_form_d"
  | "gdelt_news"
  | "bluesky"
  | "github"
  | "forums"
  | "web_social";

export type RadarSignalType =
  | "buying_intent"
  | "competitor_churn"
  | "workflow_pain"
  | "hiring"
  | "funding"
  | "news"
  | "launch"
  | "developer_activity";

/** One observation from one source, before it is qualified against the company's ICP. */
export interface RawSignal {
  source: RadarSourceId;
  type: RadarSignalType;
  entityName: string | null;
  domain: string | null;
  url: string;
  title: string;
  excerpt: string;
  author: string | null;
  eventAt: string | null;
  meta?: Record<string, unknown>;
}

export interface WatchConfig {
  keywords: string[];
  competitors: string[];
  geographies: string[];
  forums: string[];
  atsBoards: Array<{ ats: "greenhouse" | "lever" | "ashby"; slug: string }>;
}

export interface SourceContext {
  watch: WatchConfig;
  limit: number;
  signal: AbortSignal;
}

export interface RadarSource {
  id: RadarSourceId;
  label: string;
  /** Plain-language note for the health UI when this source is best-effort. */
  note?: string;
  /** Minimum gap between runs of this source across all watches, to stay inside free rate limits. */
  minIntervalMs: number;
  /** A source that cannot run without setup (a key, a configured board) reports why instead of failing. */
  available(watch: WatchConfig): string | null;
  fetch(ctx: SourceContext): Promise<RawSignal[]>;
}

export interface SourceStateRow {
  source: string;
  backoff_until: string | null;
  consecutive_failures: number;
  last_ok_at: string | null;
  last_error: string | null;
}
