"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Menu, Moon, Sun, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ENTERPRISE_PLAN } from "@/lib/billing/plans";
import { useTheme } from "@/components/theme/theme-provider";
import { createClient } from "@/lib/supabase/client";

function LandingThemeButton({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const dark = theme !== "light";
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={compact ? "inline-flex size-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900" : "inline-flex size-9 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"}
    >
      <Icon className="size-4" />
    </button>
  );
}

export function Navbar({ embedded = false }: { embedded?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const pathname = usePathname();
  const showTheme = pathname === "/";
  const showDashboard = pathname === "/" && signedIn;

  useEffect(() => {
    if (pathname !== "/") return;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [pathname]);

  const bookCall = (
    <a
      href={ENTERPRISE_PLAN.bookingUrl}
      target="_blank"
      rel="noreferrer"
      onClick={() => setIsOpen(false)}
      className={
        embedded
          ? "hero-outline-btn inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium"
          : "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
      }
    >
      Book a Call
    </a>
  );

  const navLinks = embedded
    ? [
        { href: "#how-it-works", label: "How it works" },
        { href: "#pricing", label: "Pricing" },
        { href: "#founder", label: "About" },
      ]
    : [
        { href: "#hero", label: "Home" },
        { href: "#how-it-works", label: "How it works" },
        { href: "#pricing", label: "Pricing" },
        { href: "#founder", label: "About" },
      ];

  return (
    <header className={embedded ? "relative z-20 w-full" : "fixed top-4 sm:top-5 left-0 right-0 z-50 flex justify-center px-4 sm:px-6 pointer-events-none"}>
      <div className={embedded ? "flex w-full flex-col" : "landing-nav pointer-events-auto flex w-full max-w-[360px] flex-col rounded-2xl border border-[#EEEEEE] bg-white/95 shadow-[0px_6px_20px_0px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all lg:max-w-[920px]"}>
        {/* Main Bar */}
        <div className={embedded ? "flex items-center justify-between gap-3 py-2" : "flex items-center justify-between gap-4 px-3.5 py-2.5 sm:px-4 sm:py-2.5"}>
          {/* Logo and Nav links */}
          <div className="flex items-center gap-6 sm:gap-7">
            <BrandLogo
              href="/"
              size={embedded ? 20 : 24}
              priority
              className="transition-opacity hover:opacity-85"
              onClick={() => setIsOpen(false)}
            />

            {/* Desktop Navigation Links */}
            <nav className="hidden items-center gap-1.5 text-[15px] font-medium text-neutral-600 lg:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="whitespace-nowrap rounded-md px-2.5 py-1 transition-colors hover:bg-neutral-100/60 hover:text-neutral-950"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Desktop Action Buttons */}
          <div className="hidden items-center gap-2 lg:flex">
            {showTheme ? <LandingThemeButton compact={embedded} /> : null}
            {embedded ? (
              <>
                {showDashboard ? null : (
                  <Link href="/login" className="shrink-0 whitespace-nowrap px-3 text-[14px] font-medium text-neutral-800 hover:text-neutral-950">
                    Login
                  </Link>
                )}
                <Link
                  href="#demo"
                  className="hero-outline-btn hidden h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium xl:inline-flex"
                >
                  See how it works
                </Link>
                {bookCall}
                <Link
                  href={showDashboard ? "/dashboard" : "/signup?next=/setup"}
                  className="hero-solid-btn inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium"
                >
                  {showDashboard ? "Dashboard" : "Get started"}
                </Link>
              </>
            ) : (
              <>
                {bookCall}
                <ThreeDButton href={showDashboard ? "/dashboard" : "/signup?next=/setup"} variant="solid" size="sm" className="landing-nav-cta rounded-xl px-4 shadow-none">
                  <span>{showDashboard ? "Dashboard" : "Get 50 free credits"}</span>
                  <ArrowRight className="size-3.5" />
                </ThreeDButton>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle Button (Figma 1:7152) */}
          <div className="flex items-center gap-2 lg:hidden">
            {showTheme ? <LandingThemeButton compact={embedded} /> : null}
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={embedded ? "flex h-9 items-center gap-1.5 px-1 text-xs font-semibold text-neutral-800 transition-colors" : "flex h-9 items-center gap-1.5 rounded-xl border border-[#EEEEEE] bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-xs active:bg-neutral-50 transition-colors"}
              aria-label="Toggle Navigation Menu"
            >
              <span>Menu</span>
              {isOpen ? <X className="size-3.5 text-neutral-500" /> : <Menu className="size-3.5 text-neutral-500" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu (Figma 1:7163) */}
        {isOpen && (
          <div className="flex flex-col gap-1 border-t border-[#EEEEEE] p-3 pt-2 text-center lg:hidden">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="rounded-xl py-2 text-[15px] font-medium text-neutral-700 hover:bg-neutral-100/70 hover:text-neutral-950 active:bg-neutral-100 transition-colors"
              >
                {link.label}
              </Link>
            ))}

            <div className="flex flex-col gap-2 pt-2">
              <a
                href={ENTERPRISE_PLAN.bookingUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setIsOpen(false)}
                className="rounded-full py-2 text-[15px] font-medium text-neutral-800 hover:bg-neutral-100/70"
              >
                Book a Call
              </a>
              {embedded && !showDashboard ? (
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full py-2 text-[15px] font-medium text-neutral-800"
                >
                  Login
                </Link>
              ) : null}
              {embedded ? (
                <Link
                  href={showDashboard ? "/dashboard" : "/signup?next=/setup"}
                  onClick={() => setIsOpen(false)}
                  className="hero-solid-btn inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-full px-4 text-[15px] font-medium"
                >
                  {showDashboard ? "Dashboard" : "Get started"}
                </Link>
              ) : (
                <ThreeDButton
                  href={showDashboard ? "/dashboard" : "/signup?next=/setup"}
                  variant="solid"
                  size="md"
                  onClick={() => setIsOpen(false)}
                  className="landing-nav-cta w-full rounded-xl shadow-none"
                >
                  <span>{showDashboard ? "Dashboard" : "Get 50 free credits"}</span>
                  <ArrowRight className="size-3.5" />
                </ThreeDButton>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
