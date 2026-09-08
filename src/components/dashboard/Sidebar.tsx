"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { createClient } from "@/lib/supabase/client";
import {
  Sparkles,
  Users,
  Search,
  GitBranch,
  Mail,
  BarChart3,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard/copilot", label: "Copilot", icon: Sparkles },
  { href: "/dashboard/prospects", label: "Prospects", icon: Users },
  { href: "/dashboard/prospects?new=1", label: "New Search", icon: Search },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/sequences", label: "Sequences", icon: GitBranch },
  { href: "/dashboard/inboxes", label: "Inboxes", icon: Mail },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white px-3 py-6">
      <div className="mb-6 px-3">
        <BrandLogo href="/dashboard" size={28} />
      </div>
      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const pathOnly = item.href.split("?")[0];
          const active = pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              }`}
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
