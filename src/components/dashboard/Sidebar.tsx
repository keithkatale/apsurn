"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { setDashboardContentPending } from "@/lib/navigation-progress";
import { createClient } from "@/lib/supabase/client";
import {
  Sparkles,
  Users,
  GitBranch,
  Mail,
  BarChart3,
  Radar,
  Crosshair,
  Settings,
  ShieldCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard/copilot", label: "Copilot", icon: Sparkles },
  { href: "/dashboard/prospects", label: "Prospects", icon: Users },
  { href: "/dashboard/market-insights", label: "Market Insights", icon: Radar },
  { href: "/dashboard/buying-intent", label: "Buying Intent", icon: Crosshair },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/sequences", label: "Sequences", icon: GitBranch },
  { href: "/dashboard/inboxes", label: "Inboxes", icon: Mail },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/admin", label: "Admin", icon: ShieldCheck },
];

function isActivePath(pathname: string, href: string) {
  const pathOnly = href.split("?")[0];
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
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
    <nav className="relative z-20 flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white px-3 py-6">
      <div className="mb-6 px-3">
        <BrandLogo href="/dashboard" size={28} />
      </div>
      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(activePath, item.href);
          const Icon = item.icon;

          return active ? (
            <ThreeDButton
              key={item.href}
              href={item.href}
              variant="solid"
              size="sm"
              className="w-full justify-start rounded-lg px-3 text-sm"
              onClick={(event) => onTabClick(event, item.href)}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </ThreeDButton>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => onTabClick(event, item.href)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
      <button className="mt-auto px-3 py-2 text-left text-sm text-neutral-500 hover:text-neutral-900" onClick={async () => { await createClient().auth.signOut(); router.replace("/login"); }}>Sign out</button>
    </nav>
  );
}
