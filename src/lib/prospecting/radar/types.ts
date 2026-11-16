export type SignalType =
  | "competitor_churn"
  | "tool_recommendation"
  | "workflow_pain"
  | "funding_expansion"
  | "hiring_growth";

export interface DiscoveredSignal {
  id: string;
  companyName: string;
  domain: string | null;
  contactName: string | null;
  contactTitle: string | null;
  title: string;
  snippet: string;
  sourceUrl: string;
  platform: "reddit" | "hacker_news" | "product_hunt" | "remoteok" | "web";
  signalType: SignalType;
  intentScore: number;
  detectedAt: string;
  suggestedAngle?: string;
}

export interface RadarScanOptions {
  keywords?: string[];
  competitors?: string[];
  industries?: string[];
  geographies?: string[];
  personas?: string[];
  limit?: number;
}
