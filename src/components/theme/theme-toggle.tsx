"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { type ThemePreference } from "@/lib/theme";
import { useTheme } from "./theme-provider";

const OPTIONS: Array<{ id: ThemePreference; label: string; icon: typeof Sun }> = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    const next: ThemePreference = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={`Theme: ${theme}. Switch to ${next}`}
        title={`Theme: ${theme}`}
        className="inline-flex size-9 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      >
        <Icon className="size-4" />
      </button>
    );
  }

  return (
    <div className="inline-flex rounded-lg border border-[#EEEEEE] p-0.5">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => setTheme(option.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
              selected ? "bg-[#E8F1FC] text-[#4379EE]" : "text-neutral-500 hover:text-neutral-800",
            )}
          >
            <Icon className="size-3.5" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
