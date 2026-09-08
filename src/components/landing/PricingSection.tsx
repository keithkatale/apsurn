"use client";

import Image from "next/image";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function PricingSection() {
  const plans = [
    {
      name: "Starter",
      description: "For individuals and early teams getting started with financial clarity.",
      price: "Free",
      period: "",
      highlight: false,
      buttonVariant: "soft" as const,
      features: [
        "Connect up to three data sources",
        "Basic dashboard views",
        "Standard forecasting",
        "Automated weekly reports",
        "Email support",
      ],
    },
    {
      name: "Growth",
      description: "For growing teams that need deeper insights and more automation.",
      price: "$49",
      period: "/mo",
      highlight: true,
      buttonVariant: "solid" as const,
      features: [
        "Unlimited data sources",
        "Advanced dashboard customization",
        "Real time forecasting",
        "Automated daily reports",
        "Priority support",
      ],
    },
    {
      name: "Pro",
      description: "For established teams looking for full visibility and powerful analysis.",
      price: "$99",
      period: "/mo",
      highlight: false,
      buttonVariant: "soft" as const,
      features: [
        "Full integrations with all tools",
        "Custom reporting and exports",
        "Team collaboration and permissions",
        "Anomaly detection alerts",
        "Dedicated account support",
      ],
    },
  ];

  return (
    <section
      id="pricing"
      className="relative flex items-center justify-center px-4 sm:px-8 lg:px-[70px] py-16 sm:py-20 lg:py-[80px] bg-white overflow-hidden"
    >
      <div className="flex flex-col gap-10 sm:gap-14 lg:gap-[64px] items-start w-full max-w-[1300px]">
        {/* Header matching Figma 1:3544 & mobile 1:6376 */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 w-full">
          {/* H2 Title */}
          <div className="max-w-[550px]">
            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.04em] text-black font-heading leading-tight">
              Simple{" "}
              <span className="relative inline-block pb-1 sm:pb-2 pt-1 px-1">
                pricing
                <span className="absolute -bottom-1.5 left-0 right-0 h-3 pointer-events-none">
                  <Image
                    src="/landing/pricing-underline.svg"
                    alt=""
                    width={134}
                    height={30}
                    className="w-full h-auto object-contain"
                  />
                </span>
              </span>{" "}
              for every team
            </h2>
          </div>

          {/* Subheader */}
          <div className="max-w-[380px]">
            <p className="text-base sm:text-lg font-medium text-[#605f5f] tracking-[-0.04em] leading-[1.35] font-sans">
              Choose a plan that supports your workflow and scales as you grow.
            </p>
          </div>
        </div>

        {/* 3 Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-[12px] items-stretch w-full rounded-[20px]">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col justify-between overflow-hidden rounded-[20px] p-4 transition-transform duration-200 ${
                plan.highlight
                  ? "bg-[#E8F1FC] border-2 border-[#CFE2FC] shadow-[0px_4px_20px_0px_rgba(0,0,0,0.15)] md:-translate-y-1"
                  : "bg-gradient-to-t from-[#FAFAFA] to-[#F4F4F4] border border-[#E6E6E6]"
              }`}
            >
              {/* Subtle dot pattern in lower card area matching Image 1 */}
              <div
                className="absolute inset-x-0 bottom-0 h-[270px] pointer-events-none rounded-b-[20px] opacity-20 sm:opacity-25 bg-[radial-gradient(#000000_0.85px,transparent_0.85px)] [background-size:17px_17px]"
              />

              <div className="relative z-10 flex flex-col gap-6 w-full">
                {/* Inner White Box Header */}
                <div className="flex flex-col justify-between gap-6 rounded-[12px] bg-white p-4 sm:p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.03)] min-h-[175px]">
                  {/* Title & Description */}
                  <div className="flex flex-col gap-3.5">
                    <h3 className="text-[22px] font-semibold tracking-[-0.04em] text-black font-heading leading-tight">
                      {plan.name}
                    </h3>
                    <p className="text-[15px] sm:text-[16px] text-[#605f5f] tracking-[-0.03em] leading-snug font-sans">
                      {plan.description}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="text-[34px] sm:text-[36px] font-semibold tracking-[-0.04em] text-black font-sans leading-none">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-[14px] text-[#605f5f] tracking-[-0.03em] font-sans">
                        {plan.period}
                      </span>
                    )}
                  </div>
                </div>

                {/* Lower Action & Feature List Details */}
                <div className="flex flex-col gap-3 px-1 pb-2">
                  {/* CTA Button */}
                  <div className="w-full">
                    <ThreeDButton
                      href="/setup"
                      variant={plan.buttonVariant}
                      size="md"
                      className="w-full h-11 rounded-[12px] text-[16px] font-medium tracking-[-0.03em]"
                    >
                      <span>Get started</span>
                    </ThreeDButton>
                  </div>

                  {/* Feature Checklist */}
                  <div className="flex flex-col gap-2 p-2 pt-3">
                    {plan.features.map((feature, fIdx) => (
                      <div key={fIdx} className="flex items-center gap-2.5">
                        <div className="size-[20px] shrink-0">
                          <Image
                            src="/landing/pricing-check.svg"
                            alt=""
                            width={20}
                            height={20}
                            className="size-[20px] object-contain"
                          />
                        </div>
                        <span className="text-[15px] sm:text-[16px] text-[#605f5f] tracking-[-0.03em] leading-snug font-sans">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
