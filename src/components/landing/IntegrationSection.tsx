"use client";

import Image from "next/image";
import { landingVideoUrl } from "@/lib/landing/videos";

export function IntegrationSection() {
  const row1Logos = [
    { src: "/landing/int-logo-1.png", name: "Gmail" },
    { src: "/landing/int-logo-7.png", name: "LinkedIn" },
    { src: "/landing/int-logo-9.png", name: "Supabase" },
  ];

  const row2 = [
    { label: "X / Twitter", hint: "Market Insights" },
    { label: "Reddit", hint: "Market Insights" },
    { label: "YouTube", hint: "Market Insights" },
  ];

  return (
    <section className="py-16 sm:py-28 bg-white overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="mx-auto max-w-2xl text-center flex flex-col items-center gap-2.5 sm:gap-3">
          <h2 className="text-2xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-neutral-950 font-heading leading-tight">
            <span className="relative inline-block">
              Connect
              <span className="absolute -bottom-1.5 sm:-bottom-2 left-0 right-0 h-2.5 sm:h-3 pointer-events-none">
                <Image
                  src="/landing/connect-underline.svg"
                  alt=""
                  width={171}
                  height={30}
                  className="w-full h-auto object-contain"
                />
              </span>
            </span>{" "}
            what you use to send
          </h2>
          <p className="text-base sm:text-lg text-neutral-600 font-medium max-w-xl">
            Send from your connected email via OAuth. Discover intent across social with Market Insights. More CRM
            connectors are on the roadmap.
          </p>
        </div>

        <div className="mt-10 sm:mt-14 relative flex flex-col items-center justify-center">
          <div className="relative z-10 size-36 sm:size-52">
            <video
              src={landingVideoUrl("connect.mp4")}
              autoPlay
              loop
              muted
              playsInline
              className="size-full object-contain"
              aria-label="Integration hub"
            />
          </div>

          <div className="mt-6 sm:mt-8 flex flex-col gap-4 sm:gap-5 w-full max-w-[880px]">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-x-0 h-0.5 bg-[#EEEEEE] -z-0" />
              <div className="relative z-10 flex flex-wrap items-center justify-center gap-2.5 sm:gap-6 bg-white px-2 sm:px-4">
                {row1Logos.map((item) => (
                  <div
                    key={item.name}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div className="flex size-14 sm:size-20 items-center justify-center rounded-xl sm:rounded-2xl border-2 border-[#EEEEEE] bg-[#F4F4F4] p-2 sm:p-3 shadow-xs transition-transform hover:scale-105">
                      <Image
                        src={item.src}
                        alt={item.name}
                        width={48}
                        height={48}
                        className="max-h-7 sm:max-h-8 w-auto object-contain"
                      />
                    </div>
                    <span className="text-[11px] font-medium text-neutral-500">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-x-0 h-0.5 bg-[#EEEEEE] -z-0" />
              <div className="relative z-10 flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 bg-white px-2 sm:px-4">
                {row2.map((item) => (
                  <div
                    key={item.label}
                    className="flex min-w-[120px] flex-col items-center justify-center rounded-xl sm:rounded-2xl border-2 border-[#EEEEEE] bg-[#F4F4F4] px-4 py-3 shadow-xs"
                  >
                    <span className="text-[13px] font-semibold text-neutral-800">{item.label}</span>
                    <span className="text-[10px] text-neutral-500">{item.hint}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
