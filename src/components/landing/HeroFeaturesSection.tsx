import Image from "next/image";
import Link from "next/link";

export function HeroFeaturesSection() {
  return (
    <section id="hero" className="landing-hero bg-white px-5 pb-16 pt-36 sm:px-8 sm:pb-20 sm:pt-44">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col items-center">
        <h1 className="max-w-[820px] text-center font-heading text-[40px] font-medium leading-[1.06] tracking-[-1.28px] text-neutral-950 sm:text-[52px] lg:text-[62.5px] lg:leading-[66.56px]">
          Get more meetings booked
          <br />
          this week
        </h1>
        <p className="mt-3 max-w-[620px] text-center text-[14.4px] font-normal leading-[18px] text-[#605F5F]">
          Turn your website into verified prospects and Gmail sequences —
          <br className="hidden sm:block" /> an AI SDR loop built for outbound GTM.
        </p>
        <div className="mt-4 flex items-center justify-center gap-6">
          <Link
            href="/signup?next=/setup"
            className="landing-hero-cta inline-flex items-center justify-center rounded-[10px] bg-[#4379EE] px-7 pb-[10px] pt-[9px] text-[12.4px] font-medium leading-[18.2px] text-white hover:bg-[#3567D6]"
          >
            Get free trial
          </Link>
          <Link
            href="#why-us"
            className="landing-hero-link text-[13px] font-medium leading-[18.2px] text-[#605F5F]"
          >
            Learn more
          </Link>
        </div>
        <div className="mt-[68px] w-full overflow-hidden rounded-[14px] bg-black">
          <Image
            src="/landing/dashboard.png"
            alt="apsurn campaigns workspace"
            width={1136}
            height={639}
            priority
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
