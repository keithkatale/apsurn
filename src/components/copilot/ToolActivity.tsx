import { Check, Loader2 } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  get_account_snapshot: "Checking your account",
  list_prospect_companies: "Looking up companies",
  list_contacts: "Looking up contacts",
  get_sequence_overview: "Checking sequences",
  get_analytics_summary: "Checking analytics",
  update_contact_status: "Updating contact status",
  archive_contacts: "Archiving contacts",
  archive_prospect_companies: "Archiving companies",
  create_sequence: "Creating sequence",
  enroll_contacts: "Enrolling contacts",
};

export function ToolActivity({ name, status }: { name: string; status: "running" | "done" }) {
  const label = TOOL_LABELS[name] ?? name;
  const running = status === "running";

  return (
    <div
      className={`copilot-tool-chip inline-flex w-fit max-w-full items-center gap-1.5 border border-[var(--copilot-card-border)] px-2 py-1 ${
        running ? "copilot-tool-shimmer" : ""
      }`}
    >
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        {running ? (
          <Loader2 className="size-3 animate-spin text-[var(--copilot-accent)]" />
        ) : (
          <Check className="size-3 text-emerald-600" />
        )}
      </span>
      <p className="text-[11px] font-medium leading-tight text-[var(--copilot-foreground)]">
        {label}
        {running ? "…" : ""}
      </p>
    </div>
  );
}
