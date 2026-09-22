"use client";

import Image from "next/image";

export function ProcessSection() {
  const steps = [
    {
      number: "01",
      title: "Connect your website",
      description: "Paste your domain. We crawl public pages and draft an ICP blueprint for you to approve.",
      image: "/landing/step1.png",
    },
    {
      number: "02",
      title: "Find & verify prospects",
      description: "Grounded search discovers matching companies and people. Only verified contacts make the cut.",
      image: "/landing/campaign.png",
    },
    {
      number: "03",
      title: "Launch email sequences",
      description: "Enroll leads, generate AI drafts, and send multi-step campaigns from your connected inbox.",
      image: "/landing/leads.png",
    },
  ];

  return (
    <section className="relative py-16 sm:py-28 overflow-hidden bg-[#FAFAFA]/50 border-y border-[#EEEEEE]">
      <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none -z-10 flex justify-center px-4">
        <div className="relative w-full max-w-[1400px] h-full rounded-[28px] sm:rounded-[40px] bg-gradient-to-b from-white from-[50%] to-[#F4F4F4]" />
      </div>

      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="mx-auto max-w-2xl text-center flex flex-col items-center gap-2.5 sm:gap-3">
          <h2 className="text-2xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-neutral-950 font-heading leading-tight">
            Get started in{" "}
            <span className="relative inline-block">
              3
              <span className="absolute -bottom-1.5 sm:-bottom-2 left-0 right-0 h-2.5 sm:h-3 pointer-events-none">
                <Image
                  src="/landing/step-3-underline.svg"
                  alt=""
                  width={27}
                  height={30}
                  className="w-full h-auto object-contain"
                />
              </span>
            </span>{" "}
            <span className="relative inline-block">
              steps
              <span className="absolute -bottom-1.5 sm:-bottom-2 left-0 right-0 h-2.5 sm:h-3 pointer-events-none">
                <Image
                  src="/landing/step-steps-underline.svg"
                  alt=""
                  width={110}
                  height={30}
                  className="w-full h-auto object-contain"
                />
              </span>
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-600 font-medium max-w-xl">
            The same autonomous flow you get in the product: blueprint → prospects → outbound sequences.
          </p>
        </div>

        <div className="mt-10 sm:mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((step) => (
            <div
              key={step.number}
              className="flex flex-col gap-4 sm:gap-5 rounded-2xl bg-white p-3.5 sm:p-4 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.06)] border border-[#EEEEEE] transition-transform hover:-translate-y-1 duration-200"
            >
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-neutral-100 border-2 border-[#F4F4F4] shadow-inner">
                <Image
                  src={step.image}
                  alt={step.title}
                  width={620}
                  height={620}
                  className="size-full object-cover object-top"
                />
                <div className="absolute bottom-3 right-3 flex size-8 sm:size-9 items-center justify-center rounded-full bg-neutral-950 text-white font-medium text-xs sm:text-sm shadow-md border border-neutral-700">
                  {step.number}
                </div>
              </div>

              <div className="flex flex-col gap-1 px-1.5 pb-1">
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-950 font-heading">
                  {step.title}
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
