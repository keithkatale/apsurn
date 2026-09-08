"use client";

import Image from "next/image";

export function TestimonialSection() {
  return (
    <section className="py-16 sm:py-28 bg-white overflow-hidden border-b border-[#EEEEEE]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="mx-auto max-w-[980px] grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-14 items-center">
          {/* Portrait Image */}
          <div className="md:col-span-5 flex justify-center">
            <div className="relative aspect-[370/440] w-full max-w-[280px] sm:max-w-[340px] rounded-2xl overflow-hidden shadow-[0px_8px_30px_0px_rgba(0,0,0,0.12)] border-2 border-[#F4F4F4]">
              <Image
                src="/landing/man-portrait.png"
                alt="John Smith, Operations Lead"
                width={370}
                height={440}
                className="size-full object-cover"
              />
            </div>
          </div>

          {/* Quote Content */}
          <div className="md:col-span-7 flex flex-col justify-between gap-6 sm:gap-8">
            <div className="flex flex-col gap-4 sm:gap-5">
              {/* Quote Icon */}
              <div className="size-7 sm:size-8 text-neutral-400">
                <Image
                  src="/landing/testimonial-quote.svg"
                  alt="Quote"
                  width={32}
                  height={25}
                  className="size-full object-contain"
                />
              </div>

              {/* Quote text */}
              <blockquote className="text-xl sm:text-2xl lg:text-[32px] font-bold tracking-tight text-neutral-950 font-heading leading-snug sm:leading-[1.3]">
                &ldquo;This platform gives us instant clarity. Our outbound discovery is more accurate and our sales team books meetings faster than ever.&rdquo;
              </blockquote>
            </div>

            {/* Author info & Logo */}
            <div className="flex items-center justify-between gap-4 pt-4 border-t border-neutral-100">
              <div>
                <p className="text-base sm:text-lg font-bold text-neutral-950 font-heading">John Smith</p>
                <p className="text-xs sm:text-sm font-medium text-neutral-500">VP of Revenue Operations</p>
              </div>

              <div className="h-7 sm:h-8 max-w-[120px] sm:max-w-[140px] flex items-center justify-end">
                <Image
                  src="/landing/novatech.png"
                  alt="NovaTech Logo"
                  width={140}
                  height={32}
                  className="max-h-6 sm:max-h-7 w-auto object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
