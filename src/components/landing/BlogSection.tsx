"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function BlogSection() {
  const articles = [
    {
      title: "The new era of autonomous outbound prospecting (2026)",
      summary: "How modern revenue teams replace manual list-building with AI-driven ICP analysis and live search.",
      image: "/landing/blog-1.png",
      href: "#",
    },
    {
      title: "How B2B startups scale cold email without burning domains",
      summary: "A practical guide to DNS setup, automated MX verification, and inbox warmup rotation.",
      image: "/landing/blog-2.png",
      href: "#",
    },
    {
      title: "A sales prospecting workflow your revenue team will love",
      summary: "What makes automated SDR workflows effective and how to turn scraped intent into booked meetings.",
      image: "/landing/blog-3.png",
      href: "#",
    },
  ];

  return (
    <section id="blog" className="py-16 sm:py-28 bg-white overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6 pb-10 sm:pb-14 border-b border-[#EEEEEE]">
          <div>
            <h2 className="text-2xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-neutral-950 font-heading leading-tight">
              Insights and{" "}
              <span className="relative inline-block">
                resources
                <span className="absolute -bottom-1.5 sm:-bottom-2 left-0 right-0 h-2.5 sm:h-3 pointer-events-none">
                  <Image
                    src="/landing/resources-underline.svg"
                    alt=""
                    width={195}
                    height={30}
                    className="w-full h-auto object-contain"
                  />
                </span>
              </span>
            </h2>
          </div>
          <p className="text-base sm:text-lg text-neutral-600 max-w-md">
            Practical outbound strategies and ideas to help modern revenue teams book more high-value qualified pipeline.
          </p>
        </div>

        {/* 3 Blog Cards */}
        <div className="mt-8 sm:mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {articles.map((item, idx) => (
            <Link
              key={idx}
              href={item.href}
              className="group flex flex-col rounded-2xl sm:rounded-3xl border border-[#EEEEEE] bg-[#FAFAFA] overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1"
            >
              <div className="relative aspect-[372/274] w-full overflow-hidden bg-neutral-100 border-b border-[#EEEEEE]">
                <Image
                  src={item.image}
                  alt={item.title}
                  width={372}
                  height={274}
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>

              <div className="flex flex-col gap-2 p-5 sm:p-7">
                <h3 className="text-base sm:text-lg font-bold text-neutral-950 font-heading group-hover:text-[#4096FF] transition-colors leading-snug">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                  {item.summary}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Read More button */}
        <div className="mt-8 sm:mt-12 flex justify-center">
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 rounded-xl border border-[#E6E6E6] bg-white px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-neutral-900 shadow-[0px_6px_10px_0px_rgba(0,0,0,0.05)] transition-all hover:bg-neutral-50 active:bg-neutral-100"
          >
            <span>Read more articles</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
