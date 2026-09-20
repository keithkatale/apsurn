/**
 * Ordered by priority, and this order is what the UI renders. Reddit, X and
 * LinkedIn are the platforms worth listening to for buying signals; YouTube
 * is supporting material rather than a primary source.
 */
export const MARKET_PLATFORMS = ["reddit", "twitter", "linkedin", "youtube"] as const;
export type MarketPlatform = (typeof MARKET_PLATFORMS)[number];

/** Pre-selected platforms for a new keyword or a scan. YouTube is opt-in: it is supporting material, not a priority source. */
export const DEFAULT_MARKET_PLATFORMS: MarketPlatform[] = ["reddit", "twitter", "linkedin"];

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
