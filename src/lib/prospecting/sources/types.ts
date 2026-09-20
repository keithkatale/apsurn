/**
 * One company as returned by a structured lead source.
 *
 * Every field is either something the source stated outright or null. Nothing
 * here is inferred, and nothing is guessed — a fabricated company or contact
 * discredits an entire list the moment someone checks it, which is exactly
 * the failure mode that made the old search-and-scrape path unusable.
 */
export interface SourcedCompany {
  name: string;
  /** Null when the source has no website field (registries generally don't). */
  domain: string | null;
  description: string | null;
  location: string | null;
  employeeBand: string | null;
  phone: string | null;
  /** Set only when the source itself named a person — registries often do. */
  contactName: string | null;
  contactTitle: string | null;
  source: string;
  sourceUrl: string | null;
  /** A buying signal the source evidences, e.g. an open go-to-market role. */
  signal: string | null;
  /** Quotable proof of the signal — a role title with a date, never an inference. */
  signalEvidence: string | null;
  signalDate: string | null;
}
