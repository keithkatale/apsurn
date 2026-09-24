import type { ToolCall } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asSteps(value: unknown): Array<{ subject_template?: string; body_template?: string; delay_days?: number }> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((step) => ({
    subject_template: typeof step.subject_template === "string" ? step.subject_template : undefined,
    body_template: typeof step.body_template === "string" ? step.body_template : undefined,
    delay_days: typeof step.delay_days === "number" ? step.delay_days : undefined,
  }));
}

export function ArtifactCard({ tool }: { tool: ToolCall }) {
  const fromChildren = (tool.children ?? []).map((child) => <ArtifactCard key={child.id} tool={child} />);
  const own = renderOwn(tool);
  if (!own && fromChildren.length === 0) return null;
  return (
    <div className="space-y-2">
      {own}
      {fromChildren}
    </div>
  );
}

function renderOwn(tool: ToolCall) {
  const result = isRecord(tool.result) ? tool.result : {};
  const args = tool.args ?? {};

  if (tool.name === "create_sequence") {
    const name = String(result.name ?? args.name ?? "Untitled sequence");
    const steps = asSteps(result.steps ?? args.steps);
    const sequenceId = isRecord(result.data) ? result.data.sequenceId : undefined;
    return (
      <article className="copilot-artifact">
        <p className="copilot-artifact-kicker">Sequence</p>
        <h3 className="copilot-artifact-title">{name}</h3>
        {sequenceId ? <p className="copilot-artifact-meta">Draft · {String(sequenceId).slice(0, 8)}</p> : null}
        <ol className="copilot-artifact-steps">
          {steps.map((step, index) => (
            <li key={`${tool.id}-step-${index}`}>
              <p className="font-medium">
                Step {index + 1}
                {step.delay_days ? ` · wait ${step.delay_days}d` : ""}
              </p>
              {step.subject_template ? <p className="text-[var(--copilot-muted)]">{step.subject_template}</p> : null}
              {step.body_template ? <pre className="copilot-artifact-body">{step.body_template}</pre> : null}
            </li>
          ))}
        </ol>
      </article>
    );
  }

  if (tool.name === "draft_outreach_email") {
    const subject = String(result.subject ?? "");
    const body = String(result.body ?? "");
    if (!subject && !body) return null;
    return (
      <article className="copilot-artifact">
        <p className="copilot-artifact-kicker">Draft</p>
        <h3 className="copilot-artifact-title">{subject || "Untitled email"}</h3>
        {result.contactName || result.sequenceName ? (
          <p className="copilot-artifact-meta">
            {[result.contactName, result.sequenceName].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <pre className="copilot-artifact-body">{body}</pre>
      </article>
    );
  }

  if (tool.name === "start_prospecting_run") {
    const criteria = isRecord(result.criteria) ? result.criteria : isRecord(args.criteria) ? args.criteria : {};
    return (
      <article className="copilot-artifact">
        <p className="copilot-artifact-kicker">Prospecting run</p>
        <h3 className="copilot-artifact-title">{result.queued ? "Queued" : "Started"}</h3>
        <p className="copilot-artifact-meta">
          {result.limit ? `${result.limit} companies` : null}
          {result.runId ? ` · ${String(result.runId).slice(0, 8)}` : null}
          {result.creditsPerCompany ? ` · ${result.creditsPerCompany} credits each` : null}
        </p>
        <dl className="copilot-artifact-meta mt-2 grid gap-1">
          {Array.isArray(criteria.industries) && criteria.industries.length > 0 ? (
            <div>
              <dt className="inline font-medium">Industries: </dt>
              <dd className="inline">{criteria.industries.join(", ")}</dd>
            </div>
          ) : null}
          {Array.isArray(criteria.personas) && criteria.personas.length > 0 ? (
            <div>
              <dt className="inline font-medium">Personas: </dt>
              <dd className="inline">{criteria.personas.join(", ")}</dd>
            </div>
          ) : null}
          {Array.isArray(criteria.geographies) && criteria.geographies.length > 0 ? (
            <div>
              <dt className="inline font-medium">Geographies: </dt>
              <dd className="inline">{criteria.geographies.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      </article>
    );
  }

  if (tool.name === "enroll_contacts" && isRecord(result.data)) {
    return (
      <article className="copilot-artifact">
        <p className="copilot-artifact-kicker">Enrollment</p>
        <h3 className="copilot-artifact-title">
          {Number(result.data.enrolled ?? 0)} enrolled
          {result.data.skipped ? ` · ${Number(result.data.skipped)} skipped` : ""}
        </h3>
      </article>
    );
  }

  return null;
}
