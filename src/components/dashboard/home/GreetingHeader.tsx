"use client";

function partOfDay(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function summary(replies: number, campaigns: number) {
  if (replies > 0) return `${replies} ${replies === 1 ? "reply needs" : "replies need"} you.`;
  if (campaigns > 0) return `${campaigns} ${campaigns === 1 ? "campaign is" : "campaigns are"} running.`;
  return "You're all caught up.";
}

export function GreetingHeader({ replies, campaigns }: { replies: number; campaigns: number }) {
  const now = new Date();
  return (
    <header suppressHydrationWarning>
      <p className="text-sm text-neutral-500" suppressHydrationWarning>
        {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
      </p>
      <h1 className="mt-1 font-heading text-2xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-3xl">
        <span suppressHydrationWarning>{partOfDay(now.getHours())}.</span> {summary(replies, campaigns)}
      </h1>
    </header>
  );
}
