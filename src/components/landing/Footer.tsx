"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";

export function Footer() {
  const [subscribed, setSubscribed] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubscribed(true);
  };

  return (
    <footer className="bg-white py-10 sm:py-14 lg:py-16 overflow-hidden">
      <div className="mx-auto max-w-[1300px] px-5 sm:px-8 lg:px-20">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-12 lg:gap-16">
          {/* Brand & Subscribe Column */}
          <div className="flex flex-col gap-7 sm:gap-8 w-full max-w-[450px]">
            {/* Logo */}
            <BrandLogo href="/" size={40} withWordmark={false} />

            {/* Subscribe Box */}
            <div className="flex flex-col gap-2 w-full">
              <h3 className="text-[20px] sm:text-[22px] font-semibold text-black tracking-[-0.88px] font-heading leading-snug">
                Stay connected
              </h3>

              {subscribed ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium py-3">
                  <Check className="size-4" />
                  <span>You&apos;re subscribed! Stay tuned for updates.</span>
                </div>
              ) : (
                <form
                  onSubmit={handleSubscribe}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full mt-1"
                >
                  <input
                    type="email"
                    required
                    placeholder="name@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 sm:h-12 flex-1 rounded-xl bg-[#F4F4F4] px-4 text-sm sm:text-base text-neutral-900 placeholder:text-[#605F5F] tracking-[-0.02em] border border-transparent focus:border-neutral-300 focus:bg-white focus:outline-none transition-all"
                  />
                  <button
                    type="submit"
                    className="h-11 sm:h-12 rounded-xl bg-black px-5 text-sm sm:text-base font-medium text-white shadow-[0px_4px_10px_0px_rgba(0,0,0,0.25)] hover:bg-neutral-900 active:scale-[0.98] transition-all shrink-0"
                  >
                    Subscribe
                  </button>
                </form>
              )}
            </div>

            {/* Social Icons */}
            <div className="flex items-center gap-2.5 pt-1">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="flex size-9 items-center justify-center rounded-full border border-[#EEEEEE] bg-[#FAFAFA] text-black hover:bg-white hover:border-neutral-300 transition-colors shadow-2xs"
                aria-label="Instagram"
              >
                <Image
                  src="/landing/social-instagram.svg"
                  alt="Instagram"
                  width={18}
                  height={18}
                />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                className="flex size-9 items-center justify-center rounded-full border border-[#EEEEEE] bg-[#FAFAFA] text-black hover:bg-white hover:border-neutral-300 transition-colors shadow-2xs"
                aria-label="LinkedIn"
              >
                <Image
                  src="/landing/social-linkedin.svg"
                  alt="LinkedIn"
                  width={18}
                  height={18}
                />
              </a>
              <a
                href="https://x.com"
                target="_blank"
                rel="noreferrer"
                className="flex size-9 items-center justify-center rounded-full border border-[#EEEEEE] bg-[#FAFAFA] text-black hover:bg-white hover:border-neutral-300 transition-colors shadow-2xs"
                aria-label="X"
              >
                <Image
                  src="/landing/social-x.svg"
                  alt="X"
                  width={18}
                  height={18}
                />
              </a>
            </div>
          </div>

          {/* Right Navigation & Credits Column */}
          <div className="flex flex-col justify-between gap-10 sm:gap-12 w-full lg:w-auto flex-1">
            {/* Nav Columns */}
            <div className="flex flex-wrap sm:flex-nowrap gap-10 sm:gap-14 lg:justify-end">
              {/* Product */}
              <div className="flex flex-col gap-3 min-w-[70px]">
                <span className="text-[16px] font-medium text-black tracking-[-0.64px]">
                  Product
                </span>
                <div className="flex flex-col gap-2.5 text-[15px] sm:text-[16px] text-[#605F5F] tracking-[-0.64px]">
                  <Link href="#hero" className="hover:text-black transition-colors">
                    Home
                  </Link>
                  <Link href="#pricing" className="hover:text-black transition-colors">
                    Pricing
                  </Link>
                  <Link href="#why-us" className="hover:text-black transition-colors">
                    Features
                  </Link>
                  <Link href="#faq" className="hover:text-black transition-colors">
                    FAQ
                  </Link>
                </div>
              </div>

              {/* Company */}
              <div className="flex flex-col gap-3 min-w-[70px]">
                <span className="text-[16px] font-medium text-black tracking-[-0.64px]">
                  Company
                </span>
                <div className="flex flex-col gap-2.5 text-[15px] sm:text-[16px] text-[#605F5F] tracking-[-0.64px]">
                  <Link href="#why-us" className="hover:text-black transition-colors">
                    About
                  </Link>
                  <Link href="#contact" className="hover:text-black transition-colors">
                    Contact
                  </Link>
                  <Link href="#blog" className="hover:text-black transition-colors">
                    Blog
                  </Link>
                </div>
              </div>

              {/* More */}
              <div className="flex flex-col gap-3 min-w-[90px]">
                <span className="text-[16px] font-medium text-black tracking-[-0.64px]">
                  More
                </span>
                <div className="flex flex-col gap-2.5 text-[15px] sm:text-[16px] text-[#605F5F] tracking-[-0.64px]">
                  <Link href="/privacy" className="hover:text-black transition-colors">
                    Privacy Policy
                  </Link>
                  <Link href="/privacy" className="hover:text-black transition-colors">
                    Terms
                  </Link>
                </div>
              </div>
            </div>

            {/* Copyright / Credits */}
            <div className="lg:text-right text-left text-[14px] sm:text-[16px] text-[#605F5F] tracking-[-0.64px]">
              <p>Designed by Lunis. All rights reserved.</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
