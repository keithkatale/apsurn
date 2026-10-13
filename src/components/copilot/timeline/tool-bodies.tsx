"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import type { ToolItem } from "@/lib/agents/timeline";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { clip, hostOf, kilo } from "./tool-phrases";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

export function Favicon({ url, className = "size-4" }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* not a url */
  }
  if (!host || failed) return <Globe className={`${className} shrink-0 opacity-50`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
      alt=""
      width={16}
      height={16}
      className={`${className} shrink-0 rounded-sm`}
      onError={() => setFailed(true)}
    />
  );
}

function ErrorLine({ text }: { text: string }) {
  return <p className="cpt-error">{text}</p>;
}

function SearchBody({ tool }: { tool: ToolItem }) {
  if (tool.status === "running") return <p>Searching…</p>;
  if (tool.status === "failed") return <ErrorLine text={tool.error ?? "Search failed."} />;
  const result = record(tool.result);
  const rows = list(result.results);
  if (rows.length === 0) return <p>{typeof result.note === "string" ? result.note : "No results."}</p>;
  return (
    <div>
      {rows.map((row, index) => {
        const url = String(row.url ?? "");
        return (
          <div key={`${url}-${index}`} className="cpt-result cpt-in" style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}>
            <Favicon url={url} className="size-3.5 translate-y-[2px]" />
            <a href={url} target="_blank" rel="noreferrer noopener" title={url} className="min-w-0 flex-1 truncate hover:underline">
              <span className="cpt-result-title">{clip(row.title || hostOf(url), 80)}</span>
              <span className="cpt-link"> · {hostOf(url)}</span>
            </a>
          </div>
        );
      })}
    </div>
  );
}

function ScrapeBody({ tool }: { tool: ToolItem }) {
  const url = String(tool.args.url ?? tool.progress.url ?? "");
  const result = record(tool.result);
  const finalUrl = String(result.url ?? url);
  return (
    <div className="cpt-in space-y-0.5">
      <a href={finalUrl} target="_blank" rel="noreferrer noopener" className="cpt-link block break-all hover:underline">
        {finalUrl}
      </a>
      {tool.status === "running" ? <p>{tool.progress.stage === "fetching" ? "Fetching…" : "Opening…"}</p> : null}
      {tool.status === "failed" ? <ErrorLine text={tool.error ?? "The page could not be read."} /> : null}
      {tool.status === "done" ? (
        <p>
          {[result.title ? clip(result.title, 80) : "", kilo(result.chars), result.rendered ? "rendered" : ""].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function PeopleBody({ tool }: { tool: ToolItem }) {
  if (tool.status === "running") return <p>Looking…</p>;
  if (tool.status === "failed") return <ErrorLine text={tool.error ?? "The lookup failed."} />;
  const people = list(record(tool.result).people);
  if (people.length === 0) return <p>No one found for that company.</p>;
  return (
    <div>
      {people.map((person, index) => (
        <div key={index} className="cpt-result cpt-in" style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}>
          <ContactAvatar name={String(person.fullName ?? "")} linkedinUrl={person.linkedinUrl ? String(person.linkedinUrl) : null} className="!size-4 !rounded-full !text-[7px] translate-y-[2px]" />
          <div className="min-w-0 flex-1">
            <span className="cpt-result-title">{String(person.fullName ?? "")}</span>
            {person.title ? <span> · {clip(person.title, 60)}</span> : null}
            {person.linkedinUrl ? (
              <a href={String(person.linkedinUrl)} target="_blank" rel="noreferrer noopener" className="cpt-link ml-1.5 hover:underline">
                LinkedIn
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmailBody({ tool }: { tool: ToolItem }) {
  if (tool.status === "running") return <p>{Number(tool.progress.formats) > 0 ? `Checking ${Number(tool.progress.formats)} formats at once…` : "Checking…"}</p>;
  if (tool.status === "failed") return <ErrorLine text={tool.error ?? "The check failed."} />;
  const result = record(tool.result);
  const batch = list(result.results);
  if (batch.length > 0) {
    return (
      <div>
        {batch.map((row, index) => (
          <div key={index} className="cpt-result cpt-in" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
            <ContactAvatar name={null} email={String(row.email ?? "")} className="!size-4 !rounded-full !text-[7px] translate-y-[2px]" />
            <span className="cpt-result-title min-w-0 flex-1 truncate">{String(row.email ?? "")}</span>
            <span className="cpt-badge" data-tone={row.status === "verified" ? "good" : row.status === "invalid" ? "bad" : "warn"}>{String(row.status ?? "")}</span>
          </div>
        ))}
      </div>
    );
  }
  const address = String(result.email ?? "");
  if (!address) return <p>{typeof result.reason === "string" ? result.reason : "No address found."}</p>;
  const status = typeof result.status === "string" ? result.status : null;
  const tone = status === "verified" ? "good" : status === "invalid" ? "bad" : status ? "warn" : "warn";
  return (
    <p className="cpt-in flex flex-wrap items-center gap-2">
      <ContactAvatar name={typeof tool.args.fullName === "string" ? tool.args.fullName : null} email={address} className="!size-4 !rounded-full !text-[7px]" />
      <span className="cpt-result-title">{address}</span>
      {status ? <span className="cpt-badge" data-tone={tone}>{status}</span> : result.certainty ? <span className="cpt-badge" data-tone="warn">found · not confirmed</span> : null}
    </p>
  );
}

function SaveBody({ tool }: { tool: ToolItem }) {
  if (tool.status === "running") return <p>Saving…</p>;
  if (tool.status === "failed") return <ErrorLine text={tool.error ?? "The lead was not saved."} />;
  const result = record(tool.result);
  return (
    <p className="cpt-in flex flex-wrap items-center gap-1.5">
      <ContactAvatar name={String(result.person ?? "")} email={String(result.email ?? "")} linkedinUrl={tool.args.linkedinUrl ? String(tool.args.linkedinUrl) : null} className="!size-4 !rounded-full !text-[7px]" />
      <span className="cpt-result-title">{String(result.company ?? "")}</span> · {String(result.person ?? "")}
      {result.email ? <span> · {String(result.email)}</span> : null}
      {result.listName ? <span> → saved to “{String(result.listName)}”</span> : null}
    </p>
  );
}

/** Fallback for tools with no custom view: the plain fields of the result, never a raw JSON dump. */
function GenericBody({ tool }: { tool: ToolItem }) {
  if (tool.status === "failed") return <ErrorLine text={tool.error ?? "The tool failed."} />;
  if (tool.status === "running") return <p>Working…</p>;
  const result = record(tool.result);
  const rows = Object.entries(result).filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean").slice(0, 6);
  if (rows.length === 0) return <p>Done.</p>;
  return (
    <dl className="space-y-0.5">
      {rows.map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <dt className="shrink-0 opacity-70">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
          <dd className="min-w-0 break-words text-[var(--copilot-foreground)]">{clip(value, 160)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ToolBody({ tool }: { tool: ToolItem }) {
  switch (tool.name) {
    case "web_search":
      return <SearchBody tool={tool} />;
    case "web_scrape":
      return <ScrapeBody tool={tool} />;
    case "find_people":
      return <PeopleBody tool={tool} />;
    case "find_email":
    case "verify_email":
      return <EmailBody tool={tool} />;
    case "save_lead":
      return <SaveBody tool={tool} />;
    default:
      return <GenericBody tool={tool} />;
  }
}
