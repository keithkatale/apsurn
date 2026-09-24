import { Check, Loader2 } from "lucide-react";
import { AGENT_DISPLAY_NAME, toolAgent, toolLabel } from "@/lib/agents/labels";
import type { SpecialistId } from "@/lib/agents/types";

function displayAgent(name: string, agent?: string): string | null {
  const id = (agent || toolAgent(name)) as SpecialistId | undefined;
  if (!id) return null;
  return AGENT_DISPLAY_NAME[id] ?? id;
}

export function ToolActivity({
  name,
  status,
  agent,
  selected = false,
  onSelect,
}: {
  name: string;
  status: "running" | "done";
  agent?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const label = toolLabel(name);
  const specialist = displayAgent(name, agent);
  const running = status === "running";
  const title = specialist ? `${specialist} · ${label}` : label;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`copilot-tool-chip inline-flex w-fit max-w-full items-center gap-1.5 border px-2 py-1 text-left transition-colors ${
        running ? "copilot-tool-shimmer" : ""
      } ${
        selected
          ? "border-[var(--copilot-accent)] bg-[color-mix(in_srgb,var(--copilot-accent)_12%,transparent)]"
          : "border-[var(--copilot-card-border)] hover:border-[var(--copilot-accent)] hover:bg-[var(--copilot-dropdown-hover)]"
      }`}
    >
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        {running ? (
          <Loader2 className="size-3 animate-spin text-[var(--copilot-accent)]" />
        ) : (
          <Check className="size-3 text-emerald-600" />
        )}
      </span>
      <p className="text-[13px] font-medium leading-tight text-[var(--copilot-foreground)]">
        {title}
        {running ? "…" : ""}
      </p>
    </button>
  );
}
