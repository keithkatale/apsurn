"use client";

import { ArtifactCard } from "./ArtifactCard";
import { agentThoughtSteps, CopilotThought, copilotThoughtSteps, displayAgentName } from "./CopilotThought";
import { ToolActivity } from "./ToolActivity";
import type { ToolCall } from "./types";

export function CopilotTurnProgress({
  reasoning,
  tools,
  working,
  historical = false,
  error = false,
  selectedId,
  onSelect,
}: {
  reasoning?: string;
  tools?: ToolCall[];
  working: boolean;
  historical?: boolean;
  error?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const steps = copilotThoughtSteps(reasoning, tools);
  const showThought = working || steps.length > 0 || Boolean(reasoning?.trim());
  const delegates = (tools ?? []).filter((tool) => tool.name === "delegate_to_agent");

  return (
    <div className="space-y-2">
      {showThought ? (
        <CopilotThought working={working} error={error} steps={steps} historical={historical} />
      ) : null}

      {delegates.map((tool) => {
        const agent = displayAgentName(tool.name, tool.agent);
        return (
          <div key={`thought-${tool.id}`} className="pl-4">
            <CopilotThought
              working={!historical && tool.status === "running"}
              label={`${agent}…`}
              doneLabel={agent}
              steps={agentThoughtSteps(tool)}
              historical={historical}
            />
          </div>
        );
      })}

      {tools?.map((tool) => (
        <div key={tool.id} className="space-y-2">
          <ToolActivity
            name={tool.name}
            status={tool.status}
            agent={tool.agent}
            selected={selectedId === tool.id}
            onSelect={() => onSelect?.(tool.id)}
          />
          {tool.children?.map((child) => (
            <div key={child.id} className="pl-3">
              <ToolActivity
                name={child.name}
                status={child.status}
                agent={child.agent}
                selected={selectedId === child.id}
                onSelect={() => onSelect?.(child.id)}
              />
            </div>
          ))}
          <ArtifactCard tool={tool} />
        </div>
      ))}
    </div>
  );
}
