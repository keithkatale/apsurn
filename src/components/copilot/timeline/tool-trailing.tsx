"use client";

import type { ToolItem } from "@/lib/agents/timeline";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { Favicon } from "./tool-bodies";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

const AVATAR = "!size-4 !rounded-full !text-[7px] ring-1 ring-[var(--copilot-card)]";

/**
 * What a tool row shows after its text: the sites a search returned, the favicon of the page being read, the face of
 * the person found, verified or saved. Small, and only once there is something to show.
 */
export function ToolTrailing({ tool }: { tool: ToolItem }) {
  const result = record(tool.result);
  const args = tool.args;

  switch (tool.name) {
    case "web_search": {
      const found = rows(result.results);
      if (tool.status !== "done" || found.length === 0) return null;
      const shown = found.slice(0, 5);
      return (
        <span className="cpt-trail cpt-pop">
          <span className="inline-flex items-center -space-x-1">
            {shown.map((row, index) => (
              <Favicon key={`${String(row.url)}-${index}`} url={String(row.url ?? "")} className="size-3.5 rounded-full ring-1 ring-[var(--copilot-card)]" />
            ))}
          </span>
          {found.length > shown.length ? <span className="cpt-trail-count">+{found.length - shown.length}</span> : null}
        </span>
      );
    }
    case "web_scrape": {
      const url = String(result.url ?? args.url ?? "");
      if (!url) return null;
      return (
        <span className="cpt-trail cpt-pop">
          <Favicon url={url} className="size-3.5" />
        </span>
      );
    }
    case "find_people": {
      const people = rows(result.people);
      if (tool.status !== "done" || people.length === 0) return null;
      return (
        <span className="cpt-trail cpt-pop">
          <span className="inline-flex items-center -space-x-1">
            {people.slice(0, 3).map((person, index) => (
              <ContactAvatar key={index} name={String(person.fullName ?? "")} linkedinUrl={person.linkedinUrl ? String(person.linkedinUrl) : null} className={AVATAR} />
            ))}
          </span>
        </span>
      );
    }
    case "find_email":
    case "verify_email": {
      const batch = rows(result.results).filter((row) => row.status === "verified");
      if (tool.status === "done" && batch.length > 0) {
        return (
          <span className="cpt-trail cpt-pop">
            <span className="inline-flex items-center -space-x-1">
              {batch.slice(0, 4).map((row, index) => (
                <ContactAvatar key={index} name={null} email={String(row.email ?? "")} className={AVATAR} />
              ))}
            </span>
          </span>
        );
      }
      const email = String(result.email ?? args.email ?? "");
      if (tool.status !== "done" || !email) return null;
      return (
        <span className="cpt-trail cpt-pop">
          <ContactAvatar name={typeof args.fullName === "string" ? args.fullName : null} email={email} className={AVATAR} />
        </span>
      );
    }
    case "save_lead": {
      if (tool.status !== "done") return null;
      return (
        <span className="cpt-trail cpt-pop">
          <ContactAvatar name={String(args.fullName ?? "")} email={String(args.email ?? "")} linkedinUrl={args.linkedinUrl ? String(args.linkedinUrl) : null} className={AVATAR} />
        </span>
      );
    }
    default:
      return null;
  }
}
