import { X } from "lucide-react";
import { AGENT_DISPLAY_NAME, toolAgent, toolLabel } from "@/lib/agents/labels";
import type { SpecialistId } from "@/lib/agents/types";
import { ArtifactCard } from "./ArtifactCard";
import { CopilotReasoning } from "./CopilotReasoning";
import { InspectorValue, inspectorArgEntries } from "./InspectorValue";
import { ToolActivity } from "./ToolActivity";
import type { ToolCall } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function displayAgent(name: string, agent?: string): string {
  const id = (agent || toolAgent(name)) as SpecialistId | undefined;
  if (!id) return "Copilot";
  return AGENT_DISPLAY_NAME[id] ?? id;
}

function headingFor(tool: ToolCall): string {
  if (tool.name === "delegate_to_agent") {
    const specialist = displayAgent(tool.name, tool.agent);
    return specialist === "Copilot" ? "Assigned work" : `${specialist} assignment`;
  }
  return toolLabel(tool.name);
}

function resultRecord(tool: ToolCall): Record<string, unknown> | null {
  return isRecord(tool.result) ? tool.result : tool.result == null ? null : { result: tool.result };
}

const ARTIFACT_TOOLS = new Set([
  "create_sequence",
  "draft_outreach_email",
  "start_prospecting_run",
  "enroll_contacts",
]);

export function AgentInspector({
  tool,
  onClose,
  onSelectChild,
  selectedId,
  overlay = false,
}: {
  tool: ToolCall;
  onClose: () => void;
  onSelectChild?: (id: string) => void;
  selectedId?: string;
  overlay?: boolean;
}) {
  const agent = displayAgent(tool.name, tool.agent);
  const result = resultRecord(tool);
  const task =
    (typeof tool.args?.task === "string" && tool.args.task.trim()) ||
    (typeof result?.task === "string" && result.task.trim()) ||
    null;
  const extraArgs = inspectorArgEntries(tool.args);
  const summary = typeof result?.summary === "string" ? result.summary.trim() : "";
  const showGenericResult = Boolean(result) && !ARTIFACT_TOOLS.has(tool.name);

  return (
    <aside className={`copilot-inspector ${overlay ? "copilot-inspector-overlay" : ""}`}>
      <header className="flex items-start justify-between gap-2 border-b border-[var(--copilot-card-border)] px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--copilot-accent-dim)]">{agent}</p>
          <h2 className="mt-0.5 text-[17px] font-semibold text-[var(--copilot-foreground)]">{headingFor(tool)}</h2>
          <p className="mt-1 text-[14px] text-[var(--copilot-muted)]">{tool.status === "running" ? "In progress" : "Finished"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          className="rounded-md p-1 text-[var(--copilot-muted)] hover:bg-[var(--copilot-dropdown-hover)] hover:text-[var(--copilot-foreground)]"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {task ? (
          <section>
            <h3 className="copilot-inspector-label">What they were asked</h3>
            <p className="copilot-inspector-prose">{task}</p>
          </section>
        ) : null}

        {extraArgs.length > 0 ? (
          <section>
            <h3 className="copilot-inspector-label">Details they were given</h3>
            <InspectorValue value={Object.fromEntries(extraArgs)} />
          </section>
        ) : null}

        {tool.reasoning ? <CopilotReasoning text={tool.reasoning} isStreaming={tool.status === "running"} /> : null}

        {(tool.children?.length ?? 0) > 0 ? (
          <section>
            <h3 className="copilot-inspector-label">What they did</h3>
            <ul className="space-y-1.5">
              {tool.children?.map((child) => (
                <li key={child.id}>
                  <ToolActivity
                    name={child.name}
                    status={child.status}
                    agent={child.agent}
                    selected={selectedId === child.id}
                    onSelect={() => onSelectChild?.(child.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tool.status === "done" ? (
          <section>
            <h3 className="copilot-inspector-label">What came back</h3>
            <ArtifactCard tool={tool} />
            {summary ? <p className="copilot-inspector-prose mt-2">{summary}</p> : null}
            {showGenericResult ? (
              <div className={summary ? "mt-3" : undefined}>
                <InspectorValue value={summary ? { ...result, summary: undefined } : result} />
              </div>
            ) : null}
          </section>
        ) : (
          <p className="text-[13px] text-[var(--copilot-muted)]">This agent is still working…</p>
        )}
      </div>
    </aside>
  );
}
