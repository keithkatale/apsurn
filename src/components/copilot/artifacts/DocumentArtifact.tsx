"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, ExternalLink, FileText } from "lucide-react";
import type { CopilotArtifact } from "@/lib/agents/types";

/** A saved Library document, shown where Copilot created or changed it. */
export function DocumentArtifact({ artifact }: { artifact: CopilotArtifact }) {
  const p = artifact.payload;
  const [copied, setCopied] = useState(false);
  const documentId = typeof p.documentId === "string" ? p.documentId : "";
  const shareUrl = typeof p.shareUrl === "string" ? p.shareUrl : null;
  const kindLabel = typeof p.kindLabel === "string" ? p.kindLabel : "Document";
  const excerpt = typeof p.excerpt === "string" ? p.excerpt : "";

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F1FC] text-[#4379EE]">
        <FileText className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">
          {typeof p.folder === "string" && p.folder ? p.folder.replace(/\//g, " / ") : kindLabel}
          {typeof p.version === "number" && p.version > 1 ? ` · v${p.version}` : ""}
        </p>
        <h3 className="truncate font-heading text-[15px] font-semibold tracking-tight text-[var(--copilot-foreground)]">
          {artifact.title ?? "Untitled"}
        </h3>
        {excerpt ? <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-[var(--copilot-muted)]">{excerpt}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={documentId ? `/dashboard/library?doc=${documentId}` : "/dashboard/library"}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#4379EE] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#3567D6]"
          >
            Open in Library
          </Link>
          {shareUrl ? (
            <>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-200/80"
              >
                <ExternalLink className="size-3" aria-hidden /> View page
              </a>
              <button
                type="button"
                onClick={() => void copy()}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-200/80"
              >
                {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
