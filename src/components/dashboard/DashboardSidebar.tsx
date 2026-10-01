"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Megaphone, Radar, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CopilotThreadsChips, CopilotThreadsMenu } from "@/components/copilot/CopilotSidebar";
import { CreditsBalance } from "@/components/billing/CreditsBalance";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { setDashboardContentPending } from "@/lib/navigation-progress";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid, exact: true },
  { href: "/dashboard/copilot", label: "Copilot", icon: Sparkles },
  { href: "/dashboard/prospects", label: "Prospects", icon: Users },
  { href: "/dashboard/market-insights", label: "Market Insights", icon: Radar },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
];

const SETTINGS_ITEM: NavItem = { href: "/dashboard/settings", label: "Settings", icon: Settings };

function isActivePath(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const linkBase = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const linkIdle = "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900";
const linkActive = "bg-neutral-100 font-semibold text-neutral-900";

export function DashboardSidebar() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const activePath = pendingHref ?? pathname;
  const inCopilot = activePath.startsWith("/dashboard/copilot");

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  function onNavClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (isActivePath(pathname, item)) return;
    setPendingHref(item.href);
    setDashboardContentPending(true);
  }

  const settingsActive = isActivePath(activePath, SETTINGS_ITEM);
  const settingsLink = (
    <Link
      href={SETTINGS_ITEM.href}
      onClick={(event) => onNavClick(event, SETTINGS_ITEM)}
      aria-current={settingsActive ? "page" : undefined}
      className={cn(linkBase, settingsActive ? linkActive : linkIdle)}
    >
      <Settings className="size-4 shrink-0" aria-hidden />
      Settings
    </Link>
  );

  return (
    <>
      {/* Desktop: fixed left rail */}
      <aside data-dashboard-sidebar className="z-20 hidden w-60 shrink-0 flex-col bg-white md:flex">
        <div className="flex h-14 shrink-0 items-center px-4">
          <BrandLogo href="/dashboard" size={26} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
        <nav className="flex shrink-0 flex-col gap-0.5" aria-label="Dashboard">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(activePath, { ...item, href: item.href });
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => onNavClick(event, item)}
                aria-current={active ? "page" : undefined}
                className={cn(linkBase, active ? linkActive : linkIdle)}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {inCopilot ? <CopilotThreadsMenu /> : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1 p-3">
          <CreditsBalance variant="meter" />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">{settingsLink}</div>
            <ThemeToggle compact />
          </div>
        </div>
      </aside>

      {/* Mobile: compact top bar */}
      <header data-dashboard-sidebar className="z-20 flex shrink-0 flex-col border-b border-neutral-200 bg-white md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <BrandLogo href="/dashboard" size={24} />
          <div className="flex items-center gap-1.5">
            <CreditsBalance />
            <ThemeToggle compact />
            <Link
              href={SETTINGS_ITEM.href}
              aria-label="Settings"
              className="inline-flex size-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100"
            >
              <Settings className="size-4" />
            </Link>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Dashboard">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(activePath, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => onNavClick(event, item)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium",
                  active ? linkActive : "text-neutral-600 hover:bg-neutral-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {inCopilot ? <CopilotThreadsChips /> : null}
      </header>
    </>
  );
}
