"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Ellipsis, Library, LayoutGrid, Megaphone, Radar, Settings, Users, type LucideIcon } from "lucide-react";
import { ENTERPRISE_PLAN } from "@/lib/billing/plans";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CampaignsNavChips, CampaignsNavMenu } from "@/components/campaigns/CampaignsNav";
import { CopilotThreadsChips, CopilotThreadsMenu } from "@/components/copilot/CopilotSidebar";
import { CreditsBalance } from "@/components/billing/CreditsBalance";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { setDashboardContentPending } from "@/lib/navigation-progress";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid, exact: true },
  { href: "/dashboard/prospects", label: "Prospects", icon: Users },
  { href: "/dashboard/market-insights", label: "Market Insights", icon: Radar },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/library", label: "Library", icon: Library },
];

const SETTINGS_ITEM: NavItem = { href: "/dashboard/settings", label: "Settings", icon: Settings };

const MORE_ITEMS: NavItem[] = [
  { href: "/dashboard/market-insights", label: "Market Insights", icon: Radar },
  { href: "/dashboard/library", label: "Library", icon: Library },
  SETTINGS_ITEM,
];

const PRIMARY_ITEMS = NAV_ITEMS.filter((item) => !MORE_ITEMS.some((more) => more.href === item.href));

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
  const [moreOpen, setMoreOpen] = useState(false);
  const activePath = pendingHref ?? pathname;
  // Copilot lives on the merged Home tab now — show the thread list there.
  const inCopilot = activePath === "/dashboard";
  const inCampaigns = activePath.startsWith("/dashboard/campaigns");

  useEffect(() => {
    setPendingHref(null);
    setMoreOpen(false);
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
        {inCampaigns ? <CampaignsNavMenu /> : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1 p-3">
          {demoLink}
          <CreditsBalance variant="meter" />
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">{settingsLink}</div>
            <ThemeToggle compact />
          </div>
        </div>
      </aside>

      <header data-dashboard-sidebar className="z-20 flex shrink-0 flex-col border-b border-neutral-200 bg-white pt-[env(safe-area-inset-top)] md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <BrandLogo href="/dashboard" size={24} />
          <div className="flex items-center gap-1.5">
            <CreditsBalance />
            <ThemeToggle compact />
          </div>
        </div>
        {inCopilot ? <CopilotThreadsChips /> : null}
        {inCampaigns ? <CampaignsNavChips /> : null}
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Dashboard"
      >
        <div className="grid h-16 grid-cols-4">
          {PRIMARY_ITEMS.map((item) => {
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
                  active ? "text-[#4379EE]" : "text-neutral-500",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium",
              MORE_ITEMS.some((item) => isActivePath(activePath, item)) || moreOpen ? "text-[#4379EE]" : "text-neutral-500",
            )}
          >
            <Ellipsis className="size-5" aria-hidden />
            More
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <a
              href={ENTERPRISE_PLAN.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-neutral-700"
            >
              <Calendar className="size-4 shrink-0" aria-hidden />
              Book a Demo
            </a>
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(activePath, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(event) => onNavClick(event, item)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium",
                    active ? "bg-neutral-100 text-neutral-900" : "text-neutral-700",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
