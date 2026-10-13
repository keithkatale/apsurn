/**
 * The one line each tool row shows, for every state. Pure (no React, no `@/` imports) so it runs under node:test.
 * The line names what the tool is acting on (the query, the page, the person), never just "Searching" or "Done".
 */
import type { ToolItem } from "../../../lib/agents/timeline.ts";

export function clip(value: unknown, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function hostOf(value: unknown): string {
  try {
    return new URL(String(value)).hostname.replace(/^www\./, "");
  } catch {
    return clip(value, 40);
  }
}

/** host + path, trimmed, for "Reading example.com/blog/post". */
export function shortUrl(value: unknown, max = 56): string {
  try {
    const url = new URL(String(value));
    const path = url.pathname === "/" ? "" : url.pathname;
    return clip(`${url.hostname.replace(/^www\./, "")}${path}`, max);
  } catch {
    return clip(value, max);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function kilo(chars: unknown): string {
  const n = Number(chars);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k characters` : `${n} characters`;
}

export function toolPhrase(tool: ToolItem): string {
  const args = tool.args;
  const result = record(tool.result);
  const running = tool.status === "running";
  const failed = tool.status === "failed";

  switch (tool.name) {
    case "web_search": {
      const query = clip(args.query, 70);
      if (running) return `Searching the web for “${query}”`;
      if (failed) return `Search failed for “${query}”`;
      const n = count(result.results);
      return `Searched “${query}” · ${n === 0 ? "no results" : plural(n, "result")}`;
    }
    case "web_scrape": {
      const url = shortUrl(args.url);
      if (running) return `Reading ${url}`;
      if (failed) return `Couldn’t read ${url}`;
      const title = clip(result.title, 50);
      return `Read ${hostOf(result.url ?? args.url)}${title ? ` · ${title}` : ""}`;
    }
    case "find_people": {
      const domain = clip(args.domain, 40);
      if (running) return `Finding people at ${domain}`;
      if (failed) return `Couldn’t look up people at ${domain}`;
      const n = count(result.people);
      return n === 0 ? `No people found at ${domain}` : `Found ${n === 1 ? "1 person" : `${n} people`} at ${domain}`;
    }
    case "find_email": {
      const name = clip(args.fullName, 40);
      if (running) return Number(tool.progress.formats) > 0 ? `Trying ${Number(tool.progress.formats)} email formats for ${name}` : `Looking up ${name}’s email`;
      if (failed) return `Email lookup failed for ${name}`;
      return result.email ? `Found ${clip(result.email, 50)}` : `No confirmed email for ${name}`;
    }
    case "verify_email": {
      const many = Array.isArray(args.emails) ? args.emails.length : 0;
      if (many > 1) {
        if (running) return `Verifying ${many} emails`;
        if (failed) return `Couldn’t verify ${many} emails`;
        return `Verified ${Number(result.verified) || 0} of ${many} emails`;
      }
      const email = clip(args.email ?? (Array.isArray(args.emails) ? args.emails[0] : ""), 50);
      if (running) return `Verifying ${email}`;
      if (failed) return `Couldn’t verify ${email}`;
      return result.status === "verified" ? `${email} is a real mailbox` : `${email} is ${String(result.status ?? "not confirmed")}`;
    }
    case "save_lead": {
      const company = clip(args.companyName, 40);
      if (running) return `Saving ${company}`;
      if (failed) return `Couldn’t save ${company}`;
      return `Saved ${company}${args.fullName ? ` · ${clip(args.fullName, 40)}` : ""}`;
    }
    case "present_leads":
      return running ? "Putting the leads into a table" : failed ? "Couldn’t show the leads" : `Showed ${plural(Number(result.presented) || 0, "lead")}`;
    default: {
      const label = tool.name.replace(/_/g, " ");
      const sentence = label.charAt(0).toUpperCase() + label.slice(1);
      return running ? `${sentence}…` : failed ? `${sentence} failed` : sentence;
    }
  }
}

/** Seconds as the row shows them: "4s", "1m 12s". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`;
}
