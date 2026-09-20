"use client";

import { useState } from "react";
import { Check, ChevronDown, ExternalLink, Globe, Loader2 } from "lucide-react";

function hostnameOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function shortUrl(url: string | undefined | null, max = 64): string {
  if (!url) return "";
  const stripped = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped;
}

function Favicon({ url, className = "size-3.5" }: { url?: string | null; className?: string }) {
  const host = hostnameOf(url);
  const [failed, setFailed] = useState(false);
  if (!host || failed) return <Globe className={`${className} text-neutral-400`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?sz=32&domain=${host}`}
      alt=""
      className={`${className} rounded-sm`}
      onError={() => setFailed(true)}
    />
  );
}

export interface AgentActivityItemData {
  id: string;
  name: string;
  status: "running" | "done";
  args: Record<string, unknown>;
  result?: unknown;
}

function describe(item: AgentActivityItemData): { label: string; url: string | null } {
  const { name, args, status, result } = item;
  const running = status === "running";
  const r = (result ?? {}) as Record<string, unknown>;

  switch (name) {
    case "web_search": {
      const query = String(args.query ?? "");
      const count = Array.isArray(r.results) ? r.results.length : null;
      return {
        label: running ? `Searching the web for "${query}"` : `Searched the web for "${query}"${count != null ? ` — ${count} result${count === 1 ? "" : "s"}` : ""}`,
        url: null,
      };
    }
    case "open_page": {
      const url = String(args.url ?? "");
      return { label: running ? `Reading ${shortUrl(url)}` : `Read ${shortUrl(url)}${typeof r.title === "string" && r.title ? ` — "${r.title}"` : ""}`, url };
    }
    case "extract_companies": {
      const url = String(args.url ?? "");
      const count = Array.isArray(r.companies) ? r.companies.length : null;
      return {
        label: running ? `Extracting companies from ${shortUrl(url)}` : `Found ${count ?? 0} compan${count === 1 ? "y" : "ies"} on ${shortUrl(url)}`,
        url,
      };
    }
    case "find_people": {
      const domain = String(args.domain ?? "");
      const count = Array.isArray(r.people) ? r.people.length : null;
      if (running) return { label: `Looking up decision makers at ${domain}`, url: null };
      // A failed lookup and an empty one mean different things, and the
      // difference is exactly what was invisible before.
      if (typeof r.error === "string") return { label: `Couldn't look up people at ${domain} — ${r.error}`, url: null };
      return {
        label: count ? `Found ${count} decision ${count === 1 ? "maker" : "makers"} at ${domain}` : `No decision makers listed at ${domain}`,
        url: null,
      };
    }
    case "extract_people": {
      const url = String(args.url ?? "");
      const count = Array.isArray(r.people) ? r.people.length : null;
      if (running) return { label: `Reading people from ${shortUrl(url)}`, url };
      if (!count && typeof r.reason === "string") {
        return { label: `No people on ${shortUrl(url)} — ${r.reason}`, url };
      }
      return {
        label: `Found ${count ?? 0} ${count === 1 ? "person" : "people"} on ${shortUrl(url)}`,
        url,
      };
    }
    case "find_leads": {
      const count = typeof r.count === "number" ? r.count : null;
      if (running) return { label: "Searching the contact database for matching decision makers", url: null };
      if (typeof r.error === "string") return { label: r.error, url: null };
      return { label: count ? `Found ${count} matching ${count === 1 ? "lead" : "leads"}` : "No matching leads found", url: null };
    }
    case "find_companies": {
      const source = String(args.source ?? "");
      const count = typeof r.count === "number" ? r.count : null;
      return {
        label: running ? `Pulling companies from ${source}` : `Pulled ${count ?? 0} companies from ${source}`,
        url: null,
      };
    }
    case "check_hiring_signal": {
      const domain = String(args.domain ?? "");
      const matched = Array.isArray(r.matchingRoles) ? r.matchingRoles.length : null;
      if (running) return { label: `Checking open roles at ${domain}`, url: null };
      return {
        label: matched ? `${domain} has ${matched} matching open ${matched === 1 ? "role" : "roles"}` : `No matching open roles at ${domain}`,
        url: null,
      };
    }
    case "qualify": {
      const who = String(args.fullName ?? "");
      const at = String(args.companyName ?? "");
      return {
        label: running
          ? `Qualifying ${who}${at ? ` at ${at}` : ""}`
          : `${r.fit ? "Qualified" : "Rejected"} ${who}${at ? ` at ${at}` : ""}${typeof r.reason === "string" && r.reason ? ` — ${r.reason}` : ""}`,
        url: null,
      };
    }
    case "resolve_email": {
      const who = String(args.fullName ?? "");
      const domain = String(args.domain ?? "");
      return {
        label: running ? `Resolving an email for ${who} at ${domain}` : `${r.email ? `Resolved ${String(r.email)}` : "Could not resolve an email"} for ${who}${r.status ? ` (${String(r.status)})` : ""}`,
        url: null,
      };
    }
    case "save_lead": {
      const company = (args.company ?? {}) as Record<string, unknown>;
      const name2 = String(company.name ?? company.domain ?? "");
      return {
        label: running ? `Saving ${name2}` : r.saved ? `Saved ${name2} — ${Number(r.contactCount ?? 0)} contact${r.contactCount === 1 ? "" : "s"}` : `Skipped ${name2}${typeof r.reason === "string" ? ` (${r.reason})` : ""}`,
        url: null,
      };
    }
    default:
      return { label: name, url: null };
  }
}

function Detail({ item }: { item: AgentActivityItemData }) {
  const { name, result } = item;
  const r = (result ?? {}) as Record<string, unknown>;

  if (name === "web_search" && Array.isArray(r.results) && r.results.length > 0) {
    return (
      <div className="mt-1.5 flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-2">
        {(r.results as Array<{ url: string; title: string }>).map((res, i) => (
          <a
            key={i}
            href={res.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded px-1.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-100"
          >
            <Favicon url={res.url} />
            <span className="min-w-0 flex-1 truncate">{res.title || res.url}</span>
            <span className="shrink-0 truncate text-[11px] text-neutral-400">{hostnameOf(res.url)}</span>
            <ExternalLink className="size-3 shrink-0 text-neutral-400" />
          </a>
        ))}
      </div>
    );
  }

  if (name === "extract_companies" && Array.isArray(r.companies) && r.companies.length > 0) {
    return (
      <div className="mt-1.5 flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-2">
        {(r.companies as Array<{ name: string; domain: string | null }>).map((c, i) => (
          <div key={i} className="flex items-center gap-2 px-1.5 py-0.5 text-[12px] text-neutral-700">
            <Favicon url={c.domain ? `https://${c.domain}` : undefined} />
            <span className="truncate">{c.name}</span>
            {c.domain && <span className="shrink-0 text-[11px] text-neutral-400">{c.domain}</span>}
          </div>
        ))}
      </div>
    );
  }

  if (name === "extract_people" && Array.isArray(r.people) && r.people.length > 0) {
    return (
      <div className="mt-1.5 flex flex-col gap-1 rounded-md border border-neutral-200 bg-neutral-50 p-2">
        {(r.people as Array<{ fullName: string; title: string | null }>).map((p, i) => (
          <div key={i} className="truncate px-1.5 py-0.5 text-[12px] text-neutral-700">
            {p.fullName}
            {p.title ? <span className="text-neutral-400"> — {p.title}</span> : null}
          </div>
        ))}
      </div>
    );
  }

  return null;
}

export function AgentActivityItem({ item }: { item: AgentActivityItemData }) {
  const [expanded, setExpanded] = useState(false);
  const { label, url } = describe(item);
  const running = item.status === "running";
  const r = (item.result ?? {}) as Record<string, unknown>;
  const expandable =
    item.status === "done" &&
    ((item.name === "web_search" && Array.isArray(r.results) && r.results.length > 0) ||
      (item.name === "extract_companies" && Array.isArray(r.companies) && r.companies.length > 0) ||
      (item.name === "extract_people" && Array.isArray(r.people) && r.people.length > 0));

  const chipClass = `inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-left ${
    expandable || url ? "cursor-pointer hover:bg-neutral-50" : "cursor-default"
  }`;

  const chipContent = (
    <>
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        {running ? <Loader2 className="size-3 animate-spin text-neutral-500" /> : <Check className="size-3 text-emerald-600" />}
      </span>
      {url ? <Favicon url={url} /> : null}
      <span className="min-w-0 truncate text-[12px] text-neutral-700">{label}</span>
      {url && <ExternalLink className="size-3 shrink-0 text-neutral-400" />}
      {expandable && <ChevronDown className={`size-3 shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`} />}
    </>
  );

  return (
    <div className="flex flex-col">
      <div className="flex w-fit max-w-full items-center gap-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className={chipClass}>
            {chipContent}
          </a>
        ) : (
          <button type="button" disabled={!expandable} onClick={() => expandable && setExpanded((v) => !v)} className={chipClass}>
            {chipContent}
          </button>
        )}
        {url && expandable && (
          <button
            type="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 hover:bg-neutral-50"
          >
            <ChevronDown className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {expanded && <Detail item={item} />}
    </div>
  );
}
