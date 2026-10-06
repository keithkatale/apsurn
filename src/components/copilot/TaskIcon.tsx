import { cn } from "@/lib/cn";
import { taskMaterialIcon } from "@/lib/copilot/task-icon";

const STATUS_DOT: Record<string, { className: string; label: string; pulse?: boolean }> = {
  queued: { className: "bg-[#4379EE]", label: "Starting", pulse: true },
  running: { className: "bg-[#4379EE]", label: "Running", pulse: true },
  waiting: { className: "bg-[#4379EE]", label: "Waiting on a run", pulse: true },
  cancelling: { className: "bg-neutral-400", label: "Cancelling", pulse: true },
  awaiting_approval: { className: "bg-amber-400", label: "Needs approval" },
  paused: { className: "bg-amber-400", label: "Needs your input" },
  completed: { className: "bg-emerald-500", label: "Done" },
  failed: { className: "bg-red-500", label: "Failed" },
};

export function TaskIcon({
  text,
  storedIcon,
  className = "size-4",
  status,
}: {
  /** Title + first message, used to re-pick an icon when none is stored yet. */
  text: string;
  storedIcon?: string | null;
  className?: string;
  /** Background task status — shown as a small corner dot. */
  status?: string | null;
}) {
  const name = taskMaterialIcon(text, storedIcon);
  const dot = status ? STATUS_DOT[status] : undefined;
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn("material-symbols-outlined inline-flex shrink-0 items-center justify-center leading-none", className)}
        style={{ fontSize: 15 }}
        aria-hidden
      >
        {name}
      </span>
      {dot ? (
        <span
          className={cn("absolute -right-0.5 -top-0.5 size-1.5 rounded-full ring-1 ring-white dark:ring-neutral-900", dot.className, dot.pulse && "animate-pulse")}
          title={dot.label}
          aria-label={dot.label}
        />
      ) : null}
    </span>
  );
}
