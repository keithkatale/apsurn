import type { BusinessProfile as Profile } from '@/lib/types'

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-5 ${className}`}>
      <h3 className="mb-3 font-mono text-xs tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-relaxed text-pretty">{value}</dd>
    </div>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-relaxed">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
          <span className="text-pretty">{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-md border bg-secondary px-2 py-1 text-xs">
          {item}
        </li>
      ))}
    </ul>
  )
}

export function BusinessProfile({ profile, url, pagesRead }: { profile: Profile; url: string; pagesRead: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-signal/15 px-2 py-0.5 font-mono text-xs text-signal">{profile.category}</span>
          <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted-foreground hover:text-foreground">
            {new URL(url).hostname}
          </a>
          <span className="font-mono text-xs text-muted-foreground">· {pagesRead.length} pages read</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{profile.companyName}</h2>
        <p className="max-w-3xl leading-relaxed text-muted-foreground text-pretty">{profile.oneLiner}</p>
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
          <p className="mb-4 text-sm leading-relaxed text-pretty">{profile.valueProposition}</p>
          <List items={profile.keyFeatures} />
        </Section>

        <Section title="Ideal customer profile" className="md:col-span-2 lg:col-span-1">
          <p className="mb-4 text-sm leading-relaxed text-pretty">{profile.icp.summary}</p>
          <dl className="flex flex-col gap-3">
            <Field label="Company size" value={profile.icp.companySize} />
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs text-muted-foreground">Buyer personas</dt>
              <dd>
                <Chips items={profile.icp.buyerPersonas} />
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs text-muted-foreground">Industries</dt>
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
