"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Calendar, HardHat, Radar, Settings, Users, type LucideIcon } from "lucide-react";
import { ENTERPRISE_PLAN } from "@/lib/billing/plans";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CreditsBalance } from "@/components/billing/CreditsBalance";
import { cn } from "@/lib/cn";
import { setDashboardContentPending } from "@/lib/navigation-progress";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Radar", icon: Radar, exact: true },
  { href: "/dashboard/prospects", label: "Prospects", icon: Users },
  { href: "/dashboard/real-estate-leads", label: "Commercial Leads", icon: HardHat },
  { href: "/dashboard/business", label: "Business", icon: Building2 },
];

const SETTINGS_ITEM: NavItem = { href: "/dashboard/settings", label: "Settings", icon: Settings };

function isActivePath(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const linkBase = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const linkIdle = "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100";
const linkActive = "bg-neutral-100 font-semibold text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100";

export function DashboardSidebar() {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const activePath = pendingHref ?? (pathname.startsWith("/dashboard/tasks/") ? "/dashboard" : pathname);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  function onNavClick(event: MouseEvent<HTMLAnchorElement>, item: NavItem) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (isActivePath(pathname, item)) return;
    setPendingHref(item.href);
    setDashboardContentPending(true);
  }

  const demoLink = (
    <a href={ENTERPRISE_PLAN.bookingUrl} target="_blank" rel="noreferrer" className={cn(linkBase, linkIdle)}>
      <Calendar className="size-4 shrink-0" aria-hidden />
      Book a Demo
    </a>
  );

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
      <aside data-dashboard-sidebar className="z-20 hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#0a0a0a] md:flex">
        <div className="flex h-14 shrink-0 items-center px-4">
          <BrandLogo href="/dashboard" size={30} />
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
        </div>
        <div className="flex shrink-0 flex-col gap-1 p-3">
          {demoLink}
          <CreditsBalance variant="meter" />
          <div className="min-w-0">{settingsLink}</div>
        </div>
      </aside>

      <header data-dashboard-sidebar className="z-20 flex shrink-0 flex-col border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#0a0a0a] pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <BrandLogo href="/dashboard" size={28} />
          <div className="flex items-center gap-1.5">
            <CreditsBalance />
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#0a0a0a] pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Dashboard"
      >
        <div className="grid h-16 grid-cols-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(activePath, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(event) => onNavClick(event, item)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium",
                  active ? "font-semibold text-neutral-900 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <Link
            href={SETTINGS_ITEM.href}
            onClick={(event) => onNavClick(event, SETTINGS_ITEM)}
            aria-current={settingsActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium",
              settingsActive ? "font-semibold text-neutral-900 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400",
            )}
          >
            <Settings className="size-5" aria-hidden />
            Settings
          </Link>
        </div>
      </nav>
    </>
  );
}
