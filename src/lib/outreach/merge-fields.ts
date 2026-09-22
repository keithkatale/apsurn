/** Merge fields drawn from a selected lead’s profile. Stored as {{key}}, shown as chips. */

export const MERGE_FIELD_KEYS = ["first_name", "full_name", "title", "email", "company", "domain"] as const;
export type MergeFieldKey = (typeof MERGE_FIELD_KEYS)[number];

export type LeadMergeSource = {
  fullName?: string | null;
  title?: string | null;
  email?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
};

export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] || "";
}

export function leadMergeVars(lead: LeadMergeSource | null | undefined): Record<MergeFieldKey, string> {
  return {
    first_name: firstNameOf(lead?.fullName),
    full_name: (lead?.fullName ?? "").trim(),
    title: (lead?.title ?? "").trim(),
    email: (lead?.email ?? "").trim(),
    company: (lead?.companyName ?? "").trim(),
    domain: (lead?.companyDomain ?? "").trim(),
  };
}

const TOKEN_RE = /\{\{\s*(\w+)\s*\}\}/g;

export function isMergeFieldKey(key: string): key is MergeFieldKey {
  return (MERGE_FIELD_KEYS as readonly string[]).includes(key);
}

/** Replace hardcoded lead names with tokens when the AI returns resolved text. */
export function tokenizeLeadMentions(text: string, lead: LeadMergeSource | null | undefined): string {
  if (!text || !lead) return text;
  const vars = leadMergeVars(lead);
  let out = text;
  const replacements: Array<[string, MergeFieldKey]> = [
    [vars.full_name, "full_name"],
    [vars.email, "email"],
    [vars.company, "company"],
    [vars.domain, "domain"],
    [vars.title, "title"],
    [vars.first_name, "first_name"],
  ];
  for (const [value, key] of replacements) {
    if (!value || value.length < 2) continue;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), `{{${key}}}`);
  }
  return out;
}

export function resolveMergeFields(text: string, lead: LeadMergeSource | null | undefined): string {
  const vars = leadMergeVars(lead);
  return text.replace(TOKEN_RE, (_, key: string) => {
    if (!isMergeFieldKey(key)) return `{{${key}}}`;
    return vars[key] || `{{${key}}}`;
  });
}

export type MergeSegment =
  | { type: "text"; value: string }
  | { type: "field"; key: MergeFieldKey; raw: string };

export function parseMergeSegments(text: string): MergeSegment[] {
  const segments: MergeSegment[] = [];
  let last = 0;
  const re = new RegExp(TOKEN_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: "text", value: text.slice(last, match.index) });
    }
    const key = match[1];
    if (isMergeFieldKey(key)) {
      segments.push({ type: "field", key, raw: match[0] });
    } else {
      segments.push({ type: "text", value: match[0] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  if (segments.length === 0) segments.push({ type: "text", value: text });
  return segments;
}

export function draftStorageKey(contactId: string, sequenceId: string, stepId: string) {
  return `${contactId}:${sequenceId}:${stepId}`;
}
