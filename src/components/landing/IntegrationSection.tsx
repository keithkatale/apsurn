"use client";

import Image from "next/image";

export function IntegrationSection() {
  const row1Logos = [
    { src: "/landing/int-logo-1.png", name: "Gmail" },
    { src: "/landing/int-logo-2.png", name: "Outlook" },
    { src: "/landing/int-logo-3.png", name: "Salesforce" },
    { src: "/landing/int-logo-4.png", name: "HubSpot" },
    { src: "/landing/int-logo-5.png", name: "Slack" },
  ];

  const row2Logos = [
    { src: "/landing/int-logo-6.png", name: "Notion" },
    { src: "/landing/int-logo-7.png", name: "LinkedIn" },
    { src: "/landing/int-logo-8.png", name: "Zapier" },
    { src: "/landing/int-logo-9.png", name: "Supabase" },
  ];

  return (
    <section className="py-16 sm:py-28 bg-white overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        {/* Header */}
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
            your entire stack
          </h2>
          <p className="text-base sm:text-lg text-neutral-600 font-medium max-w-xl">
            Sync data directly with your favorite mailboxes and CRMs to keep every sales workflow unified in one place.
          </p>
        </div>

        {/* Central Illustration and Connector Wire Grid */}
        <div className="mt-10 sm:mt-14 relative flex flex-col items-center justify-center">
          {/* Main Central Hub Illustration */}
          <div className="relative z-10 size-36 sm:size-52">
            <video
              src="/landing-video/connect.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="size-full object-contain"
              aria-label="Integration hub"
            />
          </div>

          {/* Connected App Rows */}
          <div className="mt-6 sm:mt-8 flex flex-col gap-4 sm:gap-5 w-full max-w-[880px]">
            {/* Top row with connecting line */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-x-0 h-0.5 bg-[#EEEEEE] -z-0" />
              <div className="relative z-10 flex flex-wrap items-center justify-center gap-2.5 sm:gap-6 bg-white px-2 sm:px-4">
                {row1Logos.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex size-14 sm:size-20 items-center justify-center rounded-xl sm:rounded-2xl border-2 border-[#EEEEEE] bg-[#F4F4F4] p-2 sm:p-3 shadow-xs transition-transform hover:scale-105"
                  >
                    <Image
                      src={item.src}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="max-h-7 sm:max-h-8 w-auto object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom row with connecting line */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-x-0 h-0.5 bg-[#EEEEEE] -z-0" />
              <div className="relative z-10 flex flex-wrap items-center justify-center gap-2.5 sm:gap-6 bg-white px-2 sm:px-4">
                {row2Logos.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex size-14 sm:size-20 items-center justify-center rounded-xl sm:rounded-2xl border-2 border-[#EEEEEE] bg-[#F4F4F4] p-2 sm:p-3 shadow-xs transition-transform hover:scale-105"
                  >
                    <Image
                      src={item.src}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="max-h-7 sm:max-h-8 w-auto object-contain"
                    />
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
