import type { BusinessProfile as Profile } from '@/lib/types'

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`project-card rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-5 sm:p-6 ${className}`}
    >
      <h3 className="mb-3.5 text-[12px] font-medium tracking-wide text-[var(--mh-muted)] uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] text-[var(--mh-muted)]">{label}</dt>
      <dd className="text-[14px] leading-relaxed text-[var(--mh-fg)]">{value}</dd>
    </div>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="flex gap-2.5 text-[14px] leading-relaxed text-[color:color-mix(in_srgb,var(--mh-fg)_75%,transparent)]"
        >
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--mh-fg)]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] px-3 py-1 text-[12px] text-[var(--mh-fg)]"
        >
          {item}
        </li>
      ))}
    </ul>
  )
}

export function BusinessProfile({ profile, url, pagesRead }: { profile: Profile; url: string; pagesRead: string[] }) {
  return (
    <div className="flex flex-col gap-5">
      <header className="project-card flex flex-col gap-2 rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-[var(--mh-muted)]">
          <span className="rounded-full border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] px-3 py-0.5 font-medium text-[var(--mh-fg)]">
            {profile.category}
          </span>
          <a href={url} target="_blank" rel="noreferrer" className="hover:text-[var(--mh-fg)]">
            {new URL(url).hostname}
          </a>
          <span>· {pagesRead.length} pages scanned</span>
        </div>
        <h2 className="font-display mt-1 text-[clamp(28px,3.6vw,42px)] font-medium leading-[1.08] tracking-tight text-[var(--mh-fg)]">
          {profile.companyName}
        </h2>
        <p className="max-w-3xl text-[16px] leading-relaxed text-[color:color-mix(in_srgb,var(--mh-fg)_65%,transparent)]">
          {profile.oneLiner}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Section title="Business model">
          <dl className="flex flex-col gap-3">
            <Field label="Type" value={profile.businessModel.type} />
            <Field label="Revenue model" value={profile.businessModel.revenueModel} />
            <Field label="Pricing" value={profile.businessModel.pricingSignals} />
            <Field label="Sales motion" value={profile.businessModel.salesMotion} />
          </dl>
        </Section>

        <Section title="Value proposition">
          <p className="mb-4 text-[14px] leading-relaxed text-[var(--mh-fg)]">{profile.valueProposition}</p>
          <List items={profile.keyFeatures} />
        </Section>

        <Section title="Ideal customer profile" className="md:col-span-2 lg:col-span-1">
          <p className="mb-4 text-[14px] leading-relaxed text-[var(--mh-fg)]">{profile.icp.summary}</p>
          <dl className="flex flex-col gap-3">
            <Field label="Company size" value={profile.icp.companySize} />
            <div className="flex flex-col gap-1.5">
              <dt className="text-[12px] text-[var(--mh-muted)]">Buyer personas</dt>
              <dd>
                <Chips items={profile.icp.buyerPersonas} />
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-[12px] text-[var(--mh-muted)]">Industries</dt>
              <dd>
                <Chips items={profile.icp.industries} />
              </dd>
            </div>
            {profile.icp.geographies.length > 0 && (
              <Field label="Geographies" value={profile.icp.geographies.join(', ')} />
            )}
          </dl>
        </Section>

        <Section title="Pain points">
          <List items={profile.icp.painPoints} />
        </Section>

        <Section title="Buying triggers">
          <List items={profile.icp.buyingTriggers} />
        </Section>

        <Section title="Competitors & alternatives">
          <Chips items={profile.competitors} />
        </Section>
      </div>
    </div>
  )
}
