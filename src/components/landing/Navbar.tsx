"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: "#hero", label: "Home" },
    { href: "#why-us", label: "About" },
    { href: "#pricing", label: "Pricing" },
    { href: "#blog", label: "Blog" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <header className="fixed top-4 sm:top-5 left-0 right-0 z-50 flex justify-center px-4 sm:px-6 pointer-events-none">
      <div className="pointer-events-auto flex flex-col w-full max-w-[360px] md:max-w-[760px] rounded-2xl border border-[#EEEEEE] bg-white/95 shadow-[0px_6px_20px_0px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all">
        {/* Main Bar */}
        <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 sm:px-4 sm:py-2.5">
          {/* Logo and Nav links */}
          <div className="flex items-center gap-6 sm:gap-7">
            <BrandLogo
              href="/"
              size={24}
              priority
              className="transition-opacity hover:opacity-85"
              onClick={() => setIsOpen(false)}
            />

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1.5 text-[15px] font-medium text-neutral-600">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-2.5 py-1 transition-colors hover:text-neutral-950 hover:bg-neutral-100/60"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Desktop Action Buttons */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 px-2 py-1 transition-colors"
            >
              Dashboard
            </Link>
            <ThreeDButton href="/setup" variant="solid" size="sm" className="rounded-xl px-4">
              <span>Get free trial</span>
              <ArrowRight className="size-3.5" />
            </ThreeDButton>
          </div>

          {/* Mobile Menu Toggle Button (Figma 1:7152) */}
          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-[#EEEEEE] bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-xs active:bg-neutral-50 transition-colors"
              aria-label="Toggle Navigation Menu"
            >
              <span>Menu</span>
              {isOpen ? <X className="size-3.5 text-neutral-500" /> : <Menu className="size-3.5 text-neutral-500" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu (Figma 1:7163) */}
        {isOpen && (
          <div className="flex md:hidden flex-col gap-1 border-t border-[#EEEEEE] p-3 pt-2 text-center">
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

            <Link
              href="/dashboard"
              onClick={() => setIsOpen(false)}
              className="rounded-xl py-2 text-[14px] font-medium text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-900 transition-colors"
            >
              Dashboard
            </Link>

            <div className="pt-2">
              <ThreeDButton
                href="/setup"
                variant="solid"
                size="md"
                onClick={() => setIsOpen(false)}
                className="w-full rounded-xl"
              >
                <span>Get free trial</span>
                <ArrowRight className="size-3.5" />
              </ThreeDButton>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
