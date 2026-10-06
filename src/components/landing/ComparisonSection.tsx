import { Check } from "lucide-react";

const OTHERS = ["Hire an SDR", "Agency", "Big platforms"] as const;

const ROWS = [
  {
    label: "Cost",
    apsurn: "From $30/month",
    others: ["$70K+ a year", "Monthly retainer", "Priced for larger teams"],
  },
  {
    label: "Time to first campaign",
    apsurn: "About 10 minutes",
    others: ["Months to ramp", "Weeks", "Days of setup"],
  },
  {
    label: "Who to target",
    apsurn: "Drafted from your site",
    others: ["You train them", "Sometimes", "You bring the ICP"],
  },
  {
    label: "Where email sends",
    apsurn: "Your own Gmail",
    others: ["Their process", "Their process", "A separate stack"],
  },
  {
    label: "Built for founder-led sales",
    apsurn: "Yes",
    others: ["No", "No", "No"],
  },
  {
    label: "Commitment",
    apsurn: "Cancel anytime",
    others: ["A salary", "A retainer", "A longer setup"],
  },
];

export function ComparisonSection() {
  return (
    <section id="compare" className="bg-white px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto w-full max-w-[1100px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#4379EE]">Comparison</p>
        <h2 className="mt-3 max-w-[640px] font-heading text-3xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-4xl lg:text-[44px] lg:leading-[1.12]">
          Why founders pick apsurn
        </h2>
        <p className="mt-3 max-w-[520px] text-[16px] leading-relaxed text-[#605F5F]">
          The other ways to get outbound started, next to doing it yourself.
        </p>

        <div className="mt-10 flex flex-col gap-3 lg:hidden">
          {ROWS.map((row) => (
            <article key={row.label} className="rounded-2xl border border-[#E6E6E6] bg-white p-4">
              <h3 className="font-heading text-[15px] font-semibold text-neutral-950">{row.label}</h3>
              <div className="compare-apsurn mt-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                <span className="compare-apsurn-label text-[13px] font-semibold">apsurn</span>
                <span className="inline-flex items-center gap-1.5 text-right text-[14px] font-medium text-neutral-950">
                  <Check className="size-3.5 shrink-0 text-[#4379EE]" strokeWidth={2.5} />
                  {row.apsurn}
                </span>
              </div>
              <dl className="mt-3 flex flex-col gap-2">
                {OTHERS.map((name, index) => (
                  <div key={name} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#8a8a8a]">{name}</dt>
                    <dd className="text-right text-[13px] leading-snug text-[#605F5F]">{row.others[index]}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>

        <div className="mt-10 hidden overflow-x-auto rounded-[24px] border border-[#E6E6E6] lg:block">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-[14px] xl:text-[15px]">
            <thead>
              <tr>
                <th className="bg-[#FAFAFA] px-5 py-4" />
                <th className="compare-apsurn compare-apsurn-label px-5 py-4 text-left font-heading text-[16px] font-semibold">
                  apsurn
                </th>
                {OTHERS.map((name) => (
                  <th key={name} className="bg-[#FAFAFA] px-5 py-4 text-left text-[13px] font-medium text-[#605F5F]">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th className="border-t border-[#E6E6E6] bg-white px-5 py-4 text-left text-[14px] font-medium text-neutral-950">
                    {row.label}
                  </th>
                  <td className="compare-apsurn border-t border-[#E6E6E6] px-5 py-4 font-medium text-neutral-950">
                    <span className="inline-flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-[#4379EE]" strokeWidth={2.5} />
                      {row.apsurn}
                    </span>
                  </td>
                  {row.others.map((value, index) => (
                    <td key={OTHERS[index]} className="border-t border-[#E6E6E6] bg-white px-5 py-4 text-[#605F5F]">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
