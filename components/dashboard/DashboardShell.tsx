'use client'

import {
  Compass,
  LogOut,
  Mail,
  Moon,
  Radio,
  Settings,
  Sun,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import posthog from 'posthog-js'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { persistTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type NavItem = {
  id: string
  label: string
  href: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'leads', label: 'Leads', href: '/leads', icon: Users },
  { id: 'signals', label: 'Signals', href: '/signals', icon: Radio },
  { id: 'campaigns', label: 'Campaigns', href: '/campaigns', icon: Mail },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings },
]

export function DashboardShell({
  children,
  activeUrl,
  headerRight,
  fixedHeight = false,
}: {
  children: React.ReactNode
  activeUrl?: string
  activeStep?: number
  onStepSelect?: (step: number) => void
  headerRight?: React.ReactNode
  fixedHeight?: boolean
}) {
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const syncTheme = () => setIsDark(document.documentElement.classList.contains('dark'))
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    try {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.email && !data.user.email.endsWith('@guest.apsurn.com')) {
          setUserEmail(data.user.email)
        }
      })
    } catch {
      // ignore
    }
  }, [])

  const toggleTheme = () => {
    const nextDark = !isDark
    persistTheme(nextDark ? 'dark' : 'light')
    setIsDark(nextDark)
  }

  const handleSignOut = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      posthog.reset()
      setUserEmail(null)
    } catch {
      // ignore
    }
  }

  const displayHost = activeUrl
    ? activeUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
    : ''

  return (
    <div
      className={cn(
        'marketing-home flex w-full bg-[var(--mh-bg)] text-[var(--mh-fg)] selection:bg-[var(--mh-fg)] selection:text-[var(--mh-bg)]',
        fixedHeight ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh',
      )}
    >
      {/* Collapsed Left Sidebar that expands on hover */}
      <aside
        aria-label="Workspace navigation"
        className="group/sidebar fixed inset-y-0 left-0 z-40 flex w-16 flex-col justify-between overflow-hidden border-r border-[var(--mh-soft)] bg-[var(--mh-bg)]/95 py-4 backdrop-blur-md transition-[width] duration-200 ease-out hover:w-60 hover:shadow-[12px_0_40px_rgba(0,0,0,0.08)] dark:hover:shadow-[12px_0_40px_rgba(0,0,0,0.45)]"
      >
        {/* Top Brand + Primary Workspace Tabs (Leads & Campaigns) */}
        <div className="flex flex-col gap-6 px-3">
          <Link href="/" className="flex items-center gap-3 px-1.5 py-1">
            <Image
              src="/branding/apsurn-gtm.png"
              alt="apsurn"
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-[7px]"
            />
            <div className="flex min-w-0 flex-col opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">
              <span className="truncate text-[16px] font-medium tracking-[-0.03em] text-[var(--mh-fg)]">
                apsurn
              </span>
              {displayHost && (
                <span className="truncate font-mono text-[11px] text-[var(--mh-muted)]">
                  {displayHost}
                </span>
              )}
            </div>
          </Link>

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive =
                pathname.startsWith(item.href) ||
                (item.id === 'leads' && pathname.startsWith('/t/'))

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    'flex h-10 w-full items-center gap-3 rounded-[6px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]'
                      : 'text-[var(--mh-muted)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] hover:text-[var(--mh-fg)]',
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  <span className="truncate opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Bottom Controls: Website Setup, Theme Toggle & Account */}
        <div className="flex flex-col gap-1 px-3">
          <Link
            href="/setup"
            className={cn(
              'flex h-10 w-full items-center gap-3 rounded-[6px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              pathname.startsWith('/setup')
                ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]'
                : 'text-[var(--mh-muted)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] hover:text-[var(--mh-fg)]',
            )}
          >
            <Compass className="size-[18px] shrink-0" aria-hidden />
            <span className="truncate opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">
              Website Setup
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex h-10 w-full items-center gap-3 rounded-[6px] px-2.5 text-left text-[13px] font-medium whitespace-nowrap text-[var(--mh-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] hover:text-[var(--mh-fg)]"
          >
            {isDark ? <Sun className="size-[18px] shrink-0" /> : <Moon className="size-[18px] shrink-0" />}
            <span className="truncate opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          </button>

          {userEmail ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="flex h-10 w-full items-center gap-3 rounded-[6px] px-2.5 text-left text-[13px] font-medium whitespace-nowrap text-[var(--mh-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] hover:text-[var(--mh-fg)]"
              title={`Sign out (${userEmail})`}
            >
              <LogOut className="size-[18px] shrink-0" />
              <div className="flex min-w-0 flex-col opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">
                <span className="truncate text-[12px] text-[var(--mh-fg)]">{userEmail}</span>
                <span className="text-[11px] text-[var(--mh-muted)]">Sign out</span>
              </div>
            </button>
          ) : (
            <Link
              href="/login?next=/leads"
              className="flex h-10 w-full items-center gap-3 rounded-[6px] px-2.5 text-[13px] font-medium whitespace-nowrap text-[var(--mh-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] hover:text-[var(--mh-fg)]"
            >
              <User className="size-[18px] shrink-0" />
              <span className="truncate opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">
                Sign in
              </span>
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Area offset by the collapsed 64px (w-16) sidebar */}
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col pl-16',
          fixedHeight ? 'h-dvh max-h-dvh overflow-hidden' : 'min-h-dvh',
        )}
      >
        <div className={cn('flex min-h-0 flex-1 flex-col', fixedHeight && 'overflow-hidden')}>
          {children}
        </div>
      </div>
    </div>
  )
}
