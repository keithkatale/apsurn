"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { LeadTableArtifact } from "./LeadTableArtifact";
import { RunArtifact } from "./RunArtifact";
import { SequenceArtifact } from "./SequenceArtifact";

export function ArtifactSurface({
  artifact,
  expanded = false,
  onExpand,
  onCollapse,
  onChange,
}: {
  artifact: CopilotArtifact;
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onChange?: (next: CopilotArtifact) => void;
}) {
  return (
    <article
      className={`copilot-artifact-surface ${expanded ? "copilot-artifact-surface-inline" : ""}`}
      onClick={(event) => {
        if (expanded) return;
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, textarea, select, label")) return;
        onExpand?.();
      }}
    >
      <header className="mb-2 flex items-center justify-end">
        {expanded ? (
          <button type="button" className="copilot-artifact-icon-btn" onClick={onCollapse} aria-label="Collapse">
            <Minimize2 className="size-3.5" />
          </button>
        ) : (
          <button type="button" className="copilot-artifact-icon-btn" onClick={onExpand} aria-label="Expand">
            <Maximize2 className="size-3.5" />
          </button>
        )}
      </header>
      {artifact.kind === "sequence" ? (
        <SequenceArtifact artifact={artifact} expanded={expanded} onChange={onChange} />
      ) : artifact.kind === "lead_table" ? (
        <LeadTableArtifact artifact={artifact} onChange={onChange} />
      ) : artifact.kind === "run" ? (
        <RunArtifact artifact={artifact} expanded={expanded} onChange={onChange} />
      ) : null}
    </article>
  );
}
