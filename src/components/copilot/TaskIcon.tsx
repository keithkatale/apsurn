import { cn } from "@/lib/cn";
import { taskMaterialIcon } from "@/lib/copilot/task-icon";

export function TaskIcon({
  text,
  storedIcon,
  className = "size-4",
}: {
  /** Title + first message, used to re-pick an icon when none is stored yet. */
  text: string;
  storedIcon?: string | null;
  className?: string;
}) {
  const name = taskMaterialIcon(text, storedIcon);
  return (
    <span
      className={cn("material-symbols-outlined inline-flex shrink-0 items-center justify-center leading-none", className)}
      style={{ fontSize: 15 }}
      aria-hidden
    >
      {name}
    </span>
  );
}
