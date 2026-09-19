import type { MarketMentionRow } from "@/lib/market/types";

export interface MarketMentionWithKeyword extends MarketMentionRow {
  market_keywords: { keyword: string } | null;
}
