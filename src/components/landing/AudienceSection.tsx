import { Check, X } from "lucide-react";

const FITS = [
  "You run a pre-seed or seed B2B SaaS or AI startup",
  "You have a live product and a website that explains it",
  "You, the founder, are still the one doing sales",
  "You have a 1–15 person team with no dedicated sales hire yet",
];

const MISFITS = [
  "You already have an SDR team and an outbound stack",
  "You're pre-product",
  "You sell to consumers",
  "You want to blast thousands of emails a day",
];

export function AudienceSection() {
  return (
    <section id="who" className="bg-white px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto w-full max-w-[1100px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#4379EE]">Who it&apos;s for</p>
        <div className="mt-4 grid items-end gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <h2 className="max-w-[640px] font-heading text-3xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-4xl lg:text-[48px] lg:leading-[1.08]">
            Built for the founder who is still the sales team.
          </h2>
          <p className="max-w-[360px] text-[16px] leading-relaxed text-[#605F5F] lg:pb-1">
            Seed-stage B2B, with a live product and no SDR hire yet. If that isn&apos;t you, apsurn will waste your time.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          <article className="rounded-[24px] bg-[#E8F1FC] p-7 sm:p-9">
            <h3 className="font-heading text-[22px] font-semibold tracking-[-0.03em] text-neutral-950">This is you</h3>
            <ul className="mt-6 flex flex-col gap-4">
              {FITS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-neutral-950">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#4379EE] text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-[24px] border border-[#E6E6E6] bg-white p-7 sm:p-9">
            <h3 className="font-heading text-[22px] font-semibold tracking-[-0.03em] text-neutral-950">This isn&apos;t you</h3>
            <ul className="mt-6 flex flex-col gap-4">
              {MISFITS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed text-[#605F5F]">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#F4F4F4] text-[#8a8a8a]">
                    <X className="size-3" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
