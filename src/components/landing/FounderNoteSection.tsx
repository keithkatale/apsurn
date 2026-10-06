import { BrandLogo } from "@/components/brand/BrandLogo";

export function FounderNoteSection() {
  return (
    <section id="founder" className="bg-white px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto w-full max-w-[860px] rounded-[28px] border border-[#E6E6E6] bg-[#FAFAFA] px-6 py-10 sm:px-12 sm:py-14">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#4379EE]">Founder note</p>
        <h2 className="mt-4 max-w-[640px] font-heading text-3xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-4xl lg:text-[44px] lg:leading-[1.12]">
          The products weren&apos;t the problem. I had no distribution.
        </h2>
        <div className="mt-8 flex max-w-[640px] flex-col gap-5 text-[17px] leading-[1.65] text-[#605F5F]">
          <p>
            I&apos;m Keith. I spent a year building SaaS products that nobody paid for. I&apos;d launch, and then nothing would happen.
          </p>
          <p>
            I wanted a tool that would tell me who to sell to, find them, and help me write emails that didn&apos;t sound like a robot — without hiring a sales team I couldn&apos;t afford. It didn&apos;t exist at my stage, so I built it.
          </p>
          <p>If you&apos;re stuck on the same problem, I&apos;d like to hear from you. You&apos;ll get a reply from me directly.</p>
        </div>
        <div className="mt-10 flex flex-col gap-5 border-t border-[#E6E6E6] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center overflow-hidden rounded-full bg-white">
              <BrandLogo href="/" size={32} withWordmark={false} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-neutral-950">Keith Katale</p>
              <p className="text-[13px] text-[#605F5F]">Founder, apsurn</p>
            </div>
          </div>
          <a
            href="mailto:hello@apsurn.com"
            className="inline-flex h-10 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#4379EE] px-5 text-[14px] font-medium text-white hover:bg-[#3567D6] sm:w-auto"
          >
            Email hello@apsurn.com
          </a>
        </div>
      </div>
    </section>
  );
}
