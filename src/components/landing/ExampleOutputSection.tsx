const ROWS = [
  {
    prospect: "Founder · Ledgerline",
    reason: "Just raised a seed round; building first sales motion",
    verdict: "Should buy",
    kept: true,
  },
  {
    prospect: "Head of Growth · Stackmint",
    reason: "Hiring first SDR; outbound still manual",
    verdict: "Should buy",
    kept: true,
  },
  {
    prospect: "CTO · Parcelwise",
    reason: "Product matches their stack; team of 8",
    verdict: "Should buy",
    kept: true,
  },
  {
    prospect: "Founder · Brightloop",
    reason: "Consumer app; no B2B buying signal",
    verdict: "Skipped",
    kept: false,
  },
];

export function ExampleOutputSection() {
  return (
    <section id="example" className="bg-white px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto w-full max-w-[1100px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#4379EE]">
          Example output for a fictional dev-tools startup
        </p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-4xl">
          Example output
        </h2>
        <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-[#605F5F]">
          apsurn filters out bad fits instead of blasting everyone. The skipped row is part of the point.
        </p>
        <div className="mt-8 flex flex-col gap-3 md:hidden">
          {ROWS.map((row) => (
            <article key={row.prospect} className="rounded-2xl border border-[#E6E6E6] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-neutral-950">{row.prospect}</p>
                <span
                  className={
                    row.kept
                      ? "shrink-0 rounded-full bg-[#E8F1FC] px-2.5 py-1 text-[12px] font-semibold text-[#3567D6]"
                      : "shrink-0 rounded-full bg-[#F4F4F4] px-2.5 py-1 text-[12px] font-semibold text-[#8a8a8a]"
                  }
                >
                  {row.verdict}
                </span>
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-[#605F5F]">{row.reason}</p>
            </article>
          ))}
        </div>
        <div className="mt-8 hidden overflow-x-auto rounded-2xl border border-[#E6E6E6] md:block">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead className="bg-[#F4F4F4] text-[12px] font-semibold uppercase tracking-[0.08em] text-[#605F5F]">
              <tr>
                <th className="px-4 py-3 font-semibold">Prospect</th>
                <th className="px-4 py-3 font-semibold">Why apsurn picked them</th>
                <th className="px-4 py-3 font-semibold">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.prospect} className="border-t border-[#E6E6E6]">
                  <td className="px-4 py-4 font-medium text-neutral-950">{row.prospect}</td>
                  <td className="px-4 py-4 text-[#605F5F]">{row.reason}</td>
                  <td className="px-4 py-4">
                    <span
                      className={
                        row.kept
                          ? "inline-flex rounded-full bg-[#E8F1FC] px-2.5 py-1 text-[12px] font-semibold text-[#3567D6]"
                          : "inline-flex rounded-full bg-[#F4F4F4] px-2.5 py-1 text-[12px] font-semibold text-[#8a8a8a]"
                      }
                    >
                      {row.verdict}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
