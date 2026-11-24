import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

export type SpinLoaderSize = "sm" | "md" | "lg";

export type SpinLoaderProps = Readonly<{
  size?: SpinLoaderSize;
  icon?: LucideIcon;
  label?: string;
  className?: string;
  iconClassName?: string;
}>;

const SIZE: Record<SpinLoaderSize, number> = {
  sm: 18,
  md: 24,
  lg: 32,
};

export function SpinLoader({
  size = "md",
  icon: Icon,
  label = "Loading",
  className,
  iconClassName,
}: SpinLoaderProps) {
  const iconSize = SIZE[size];

  return (
    <div
      data-slot="spin-loader"
      data-size={size}
      className={cn("inline-flex items-center justify-center", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {Icon ? (
        <Icon
          size={iconSize}
          strokeWidth={2}
          className={cn("apsurn-spin text-neutral-900", iconClassName)}
          aria-hidden
        />
      ) : (
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          className={cn("apsurn-spin text-neutral-900", iconClassName)}
          aria-hidden
        >
          <circle
            cx="12"
            cy="12"
            r="9.25"
            stroke="currentColor"
            strokeWidth="2.25"
            opacity="0.18"
          />
          <path
            d="M21.25 12a9.25 9.25 0 0 0-9.25-9.25"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
