"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { LeadTableArtifact } from "./LeadTableArtifact";
import { DocumentArtifact } from "./DocumentArtifact";
import { PlanRunner } from "./PlanRunner";
import { RunArtifact } from "./RunArtifact";
import { SequenceArtifact } from "./SequenceArtifact";
import { UiArtifact } from "./UiArtifact";

export function ArtifactSurface({
  artifact,
  expanded = false,
  onExpand,
  onCollapse,
  onChange,
  onPrompt,
  onAgentWork,
}: {
  artifact: CopilotArtifact;
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onChange?: (next: CopilotArtifact) => void;
  onPrompt?: (text: string) => void;
  /** The agent started working in the background (e.g. a plan was approved); the chat should follow along. */
  onAgentWork?: () => void;
}) {
  if (artifact.kind === "plan") return <PlanRunner artifact={artifact} onAgentWork={onAgentWork} />;

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
      {artifact.kind === "document" ? null : (
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
      )}
      {artifact.kind === "sequence" ? (
        <SequenceArtifact artifact={artifact} expanded={expanded} onChange={onChange} />
      ) : artifact.kind === "lead_table" ? (
        <LeadTableArtifact artifact={artifact} onChange={onChange} />
      ) : artifact.kind === "run" ? (
        <RunArtifact artifact={artifact} expanded={expanded} onChange={onChange} />
      ) : artifact.kind === "ui" ? (
        <UiArtifact artifact={artifact} onPrompt={onPrompt} />
      ) : artifact.kind === "document" ? (
        <DocumentArtifact artifact={artifact} />
      ) : null}
    </article>
  );
}
