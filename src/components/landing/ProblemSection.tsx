const PROBLEMS = [
  {
    title: "You're not sure who to target.",
    body: "\"Companies that need this\" isn't a list. Most founders guess, send to the wrong people, and conclude that outbound doesn't work.",
  },
  {
    title: "Building lists eats your week.",
    body: "Hours on LinkedIn, guessing email formats and checking spreadsheets is time you're not spending on the product.",
  },
  {
    title: "Your emails read like templates.",
    body: "Founders can spot a mail merge instantly, so it gets deleted.",
  },
];

export function ProblemSection() {
  return (
    <section id="problem" className="bg-white px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto w-full max-w-[1100px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#4379EE]">The problem</p>
        <h2 className="mt-3 max-w-[720px] font-heading text-3xl font-semibold tracking-[-0.04em] text-neutral-950 sm:text-4xl lg:text-[44px] lg:leading-[1.15]">
          You built the product. Now you&apos;re also the sales team.
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PROBLEMS.map((item) => (
            <article key={item.title} className="rounded-2xl bg-[#F4F4F4] p-6">
              <h3 className="font-heading text-[18px] font-semibold tracking-[-0.03em] text-neutral-950">{item.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[#605F5F]">{item.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-8 max-w-[760px] text-[16px] leading-relaxed text-[#605F5F]">
          The usual fixes don&apos;t suit your stage. An SDR costs $70K+ and takes months to ramp. Agencies want long retainers. Enterprise outbound tools assume you already have a sales process.
        </p>
      </div>
    </section>
  );
}
