import type { TriggerType } from "../types";

/** One observed buying signal for one company, from any trigger collector. */
export interface SignalCandidate {
  companyName: string;
  /** Null until resolved; candidates without a domain can't become leads. */
  domain: string | null;
  triggerType: TriggerType;
  /** One line, quotable as the reason to reach out: "Hiring 3 SDRs (posted 9d ago)". */
  headline: string;
  sourceUrl: string | null;
  /** Verbatim proof from the source — never a paraphrase. */
  excerpt: string;
  /** ISO date of the event itself, not of when we saw it. */
  eventDate: string | null;
  /** The person the source tied to the signal (a hiring manager, a post's author). */
  personHint?: { name?: string | null; title?: string | null; profileUrl?: string | null } | null;
  /** Collector-specific strength in [0, 1], e.g. more matching roles = stronger. */
  strength: number;
  industry?: string | null;
  location?: string | null;
  companySize?: number | null;
}

/** All signals for one company, ranked, with the sentence that becomes qualify_reason. */
export interface ScoredLead {
  domain: string;
  companyName: string;
  signals: SignalCandidate[];
  score: number;
  qualifyReason: string;
}
