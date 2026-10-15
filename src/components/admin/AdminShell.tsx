import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminAccessError, requireAdminUser } from "@/lib/auth/admin";
import { AuthenticationError } from "@/lib/auth/session";
import { BrandLogo } from "@/components/brand/BrandLogo";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/email", label: "Email" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/settings", label: "AI settings" },
] as const;

/** Signed-in admins only; everyone else is sent to sign in or gets a 404 so the area is not advertised. */
export async function requireAdminPage() {
  try {
    return await requireAdminUser();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/login?next=/admin");
    if (error instanceof AdminAccessError) notFound();
    throw error;
  }
}

export function AdminShell({
  active,
  email,
  title,
  subtitle,
  children,
}: {
  active: (typeof TABS)[number]["href"];
  email: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-8">
            <BrandLogo href="/dashboard/copilot" size={24} />
            <nav className="flex items-center gap-1" aria-label="Admin">
              {TABS.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={tab.href === active ? "page" : undefined}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    tab.href === active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>
          <span className="hidden text-xs text-neutral-400 sm:block">{email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-neutral-600">{subtitle}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-[12px] font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] text-neutral-400">{hint}</p> : null}
    </div>
  );
}

export function BarList({ title, rows, empty = "Nothing yet." }: { title: string; rows: Array<{ label: string; count: number }>; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-neutral-700">{row.label}</span>
                <span className="shrink-0 tabular-nums text-neutral-500">{row.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full rounded-full bg-[#4379EE]" style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DailyBars({ days }: { days: Array<{ day: string; visitors: number; sessions: number }> }) {
  const max = Math.max(1, ...days.map((d) => d.sessions));
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-900">Visitors and sessions per day</h2>
      {days.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No visits recorded in this period yet.</p>
      ) : (
        <div className="mt-4 flex h-40 items-end gap-1">
          {days.map((d) => (
            <div key={d.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.day}: ${d.visitors} visitors, ${d.sessions} sessions`}>
              <div className="w-full rounded-t bg-[#4379EE]/25" style={{ height: `${(d.sessions / max) * 100}%` }}>
                <div className="w-full rounded-t bg-[#4379EE]" style={{ height: `${d.sessions ? (d.visitors / d.sessions) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-neutral-400">Dark: visitors. Light: sessions.</p>
    </section>
  );
}
