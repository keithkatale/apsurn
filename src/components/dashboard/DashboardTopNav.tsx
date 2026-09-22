"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CreditsBalance } from "@/components/billing/CreditsBalance";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { setDashboardContentPending } from "@/lib/navigation-progress";
import { useSettingsPanel } from "./settings-panel-context";

const NAV_ITEMS = [
  { href: "/dashboard/copilot", label: "Copilot" },
  { href: "/dashboard/prospects", label: "Prospects" },
  { href: "/dashboard/market-insights", label: "Market Insights" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
];

function isActivePath(pathname: string, href: string) {
  const pathOnly = href.split("?")[0];
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

export function DashboardTopNav() {
  const pathname = usePathname();
  const { openSettings, closeSettings, open } = useSettingsPanel();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const activePath = pendingHref ?? pathname;

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  function onTabClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (isActivePath(pathname, href)) return;
    setPendingHref(href);
    setDashboardContentPending(true);
  }

  return (
    <header className="z-20 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5">
      <BrandLogo href="/dashboard" size={26} />
      <nav className="flex items-center justify-center gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(activePath, item.href);
          if (active) {
            return (
              <ThreeDButton
                key={item.href}
                href={item.href}
                variant="solid"
                size="sm"
                className="shrink-0 rounded-lg px-3 text-sm"
                onClick={(event) => onTabClick(event, item.href)}
              >
                {item.label}
              </ThreeDButton>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => onTabClick(event, item.href)}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-end gap-1.5 sm:gap-2">
        <CreditsBalance />
        <ThemeToggle compact />
        {open ? (
          <ThreeDButton type="button" variant="solid" size="sm" className="rounded-lg px-3 text-sm" onClick={closeSettings}>
            Settings
          </ThreeDButton>
        ) : (
          <button
            type="button"
            onClick={openSettings}
            className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            Settings
          </button>
        )}
      </div>
    </header>
  );
}
