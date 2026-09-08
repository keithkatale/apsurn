export interface AnalyticsSite {
  id: string;
  user_id: string;
  domain: string;
  name: string;
  site_id: string;
  created_at: string;
}

export interface AnalyticsStats {
  visitors: number;
  pageViews: number;
  bounceRate: number;
  avgSessionTime: number;
}

export interface TimelinePoint {
  date: string;
  visitors: number;
}

export interface BreakdownItem {
  name: string;
  value: number;
  code?: string;
  count?: number;
  percentage?: number;
}

export interface LiveVisitor {
  id: string;
  lat: number;
  lng: number;
  country: string;
  city: string;
  page: string;
  lastSeen: string;
  device: string;
  referrer: string;
}

export type AnalyticsRange = "24h" | "7d" | "30d" | "90d";
