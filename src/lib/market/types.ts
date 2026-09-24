/**
 * Ordered by priority, and this order is what the UI renders. LinkedIn first,
 * then Reddit and X. YouTube remains in the union for existing mention rows
 * but is no longer scanned.
 */
export const MARKET_PLATFORMS = ["linkedin", "reddit", "twitter", "youtube"] as const;
export type MarketPlatform = (typeof MARKET_PLATFORMS)[number];

/** Platforms Market Insights actually pulls. YouTube is kept in the type for stored rows only. */
export const SCAN_MARKET_PLATFORMS: MarketPlatform[] = ["linkedin", "reddit", "twitter"];

/** Pre-selected platforms for a new keyword or a scan. */
export const DEFAULT_MARKET_PLATFORMS: MarketPlatform[] = [...SCAN_MARKET_PLATFORMS];

export type ScanDepth = "broad" | "deep";

export const MARKET_SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type MarketSentiment = (typeof MARKET_SENTIMENTS)[number];

export interface MarketKeywordRow {
  id: string;
  keyword: string;
  platforms: MarketPlatform[];
  is_active: boolean;
  last_scanned_at: string | null;
  created_at: string;
}

export interface MarketAccountRow {
  id: string;
  platform: MarketPlatform;
  handle: string;
  name: string | null;
  avatar_url: string | null;
  is_followed: boolean;
  last_scanned_at: string | null;
  created_at: string;
}

export interface MarketEngagement {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
}

export interface MarketComment {
  author: string | null;
  content: string;
}

export interface DiscoveredMention {
  platform: MarketPlatform;
  url: string;
  authorName: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
  mediaUrl: string | null;
  content: string;
  postedAt: string | null;
  engagement: MarketEngagement;
  comments: MarketComment[];
  sentiment: MarketSentiment | null;
}

export interface MarketMentionRow {
  id: string;
  keyword_id: string | null;
  account_id: string | null;
  platform: MarketPlatform;
  url: string;
  author_name: string | null;
  author_handle: string | null;
  author_avatar_url: string | null;
  media_url: string | null;
  content: string;
  posted_at: string | null;
  engagement: MarketEngagement;
  comments: MarketComment[];
  sentiment: MarketSentiment | null;
  is_saved: boolean;
  needs_follow_up: boolean;
  saved_account_name: string | null;
  save_note: string | null;
  saved_at: string | null;
  created_at: string;
}
