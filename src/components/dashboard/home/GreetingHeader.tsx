"use client";

function partOfDay(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function summary(prospects: number, activeRun: boolean) {
  if (activeRun) return "A prospecting run is in progress.";
  if (prospects > 0) return `${prospects} ${prospects === 1 ? "company is" : "companies are"} in your lists.`;
  return "Ready to find your next leads.";
}

export function GreetingHeader({ prospects = 0, activeRun = false }: { prospects?: number; activeRun?: boolean }) {
  const now = new Date();
  return (
    <header suppressHydrationWarning>
      <p className="text-sm text-neutral-500 dark:text-neutral-400" suppressHydrationWarning>
        {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
      </p>
      <h1 className="mt-1 font-heading text-2xl font-semibold leading-tight tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
        <span suppressHydrationWarning>{partOfDay(now.getHours())}.</span>{" "}
        <span className="text-neutral-500 dark:text-neutral-400">{summary(prospects, activeRun)}</span>
      </h1>
    </header>
  );
}
