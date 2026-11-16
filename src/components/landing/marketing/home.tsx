"use client";

import { FormEvent, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { FadeIn, ScaleUnblur } from "@/components/landing/portfolio/motion-primitives";
import { MarketingPillNav } from "@/components/landing/portfolio/marketing-nav";
import { ShaderFlow } from "@/components/landing/portfolio/shader-flow";
import { SiteFrame } from "@/components/landing/portfolio/site-frame";
import RawMagicBento from "@/components/ui/MagicBento";
const MagicBento = RawMagicBento as React.ComponentType<any>;
import RotatingText from "@/components/ui/RotatingText";
import { trackGoal } from "@/lib/analytics/datafast";
import { ENTERPRISE_PLAN, PLANS, STARTER_CREDITS, type PlanKey } from "@/lib/billing/plans";

const ROTATING_LINES = ["hiring an SDR", "an agency", "a bigger stack"];

const FITS = [
  "You run a pre-seed or seed B2B SaaS or AI startup",
  "You have a live product and a website that explains it",
  "You, the founder, are still the one doing sales",
  "You have a small team and no dedicated sales hire yet",
];

const MISFITS = [
  "You already have an SDR team and an outbound stack",
  "You're pre-product",
  "You sell to consumers",
  "You want to blast thousands of emails a day",
];

const COSTS = [
  { name: "Hire an SDR", detail: "$70k+ a year" },
  { name: "Agency", detail: "A monthly retainer" },
  { name: "Bigger platforms", detail: "Priced for a team" },
  { name: "apsurn", detail: "From $30 a month", ours: true },
] as const;

const COMPARE_CARDS = [
  {
    title: "apsurn vs hiring an SDR",
    body: "An SDR takes months to ramp, and you still have to teach them who to call. apsurn drafts that from your site and returns named people it can verify.",
    line: "About 10 minutes, from $30 a month",
  },
  {
    title: "apsurn vs an agency",
    body: "An agency is a retainer and a list you don't fully own. The companies apsurn finds stay in your account, with the page each contact came from.",
    line: "Cancel anytime",
  },
  {
    title: "apsurn vs a bigger platform",
    body: "Those tools expect you to bring the ICP and assemble the rest. apsurn starts from the website you already have and drops any address it cannot verify.",
    line: "You approve the ICP first",
  },
] as const;

const FAQS = [
  {
    q: "Do I need sales experience?",
    a: "No. apsurn drafts your ICP and finds matching companies with verified contacts. You review the lists and keep refining with Copilot.",
  },
  {
    q: "How does apsurn decide who to target?",
    a: "It reads your public website, including product pages, positioning and pricing, and drafts an ICP with industries, company size, regions and buyer roles. You approve it before any prospecting starts.",
  },
  {
    q: "How are emails verified?",
    a: "Known and inferred addresses are checked without sending mail. A company is saved only when a named person has a verified email or a LinkedIn profile. Anything without one of those is left out.",
  },
  {
    q: "Is there a free plan?",
    a: "There is no ongoing free plan. Every account starts with 50 free credits. Your card is charged when those credits run out.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. There are no contracts on the Startup and Growth plans.",
  },
  {
    q: "Can you just do it for me?",
    a: "apsurn drafts your ICP and finds verified prospects into lists you work with Copilot. If you want hands-on help for the first pass, book a call and we will set it up in your account.",
  },
] as const;

const CARD_FADE_MASK =
  "radial-gradient(ellipse 90% 110% at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.92) 40%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.4) 90%, rgba(0,0,0,0.15) 100%)";

function domainFromInput(raw: string) {
  const trimmed = raw.replace(/^\s+/, "");
  if (!/https?:\/\//i.test(trimmed) && !/[/?#]/.test(trimmed)) return trimmed;
  return trimmed.replace(/^(https?:\/\/)+/i, "").split(/[/?#]/)[0] ?? "";
}

function websiteUrl(raw: string) {
  const host = domainFromInput(raw).split(":")[0].trim().toLowerCase();
  if (!host || /\s/.test(host)) return null;
  const ok = host === "localhost" || /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host);
  return ok ? `https://${host}` : null;
}

function Wordmark() {
  return (
    <Link href="/" className="mh-focus inline-flex items-center gap-2.5 rounded-md">
      <Image src="/branding/apsurn-gtm.png" alt="" width={28} height={28} className="size-7 rounded-[7px]" />
      <span className="text-[17px] font-medium tracking-[-0.03em] text-[var(--mh-fg)]">apsurn</span>
    </Link>
  );
}

function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function WebsiteForm({ align = "start" }: { align?: "center" | "start" }) {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const url = websiteUrl(website);
    if (!url) {
      setError("Enter a valid domain, like yourcompany.com");
      return;
    }
    setError(null);
    router.push(`/setup?url=${encodeURIComponent(url)}`);
  }

  return (
    <form onSubmit={submit} className={align === "center" ? "mx-auto w-full max-w-[560px]" : "w-full max-w-[560px]"}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex h-12 min-w-0 flex-1 items-center rounded-full border border-[var(--mh-soft)] bg-[var(--mh-bg)] px-4">
          <span className="shrink-0 select-none text-[15px] text-[var(--mh-muted)]">https://</span>
          <input
            value={website}
            onChange={(event) => {
              setWebsite(domainFromInput(event.target.value));
              if (error) setError(null);
            }}
            placeholder="yourcompany.com"
            aria-label="Your website"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-2 pl-1 text-[16px] text-[var(--mh-fg)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--mh-fg)_35%,transparent)]"
          />
        </label>
        <button
          type="submit"
          className="mh-focus inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--mh-fg)] px-5 text-[15px] font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
        >
          Get started
          <ArrowRight className="size-4" />
        </button>
      </div>
      {error ? (
        <p className={`mt-2 text-[13px] text-red-600 dark:text-red-300 ${align === "center" ? "text-center" : ""}`}>
          {error}
        </p>
      ) : null}
    </form>
  );
}

function CtaPill({
  href,
  children,
  onClick,
  className = "",
}: {
  href: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`mh-focus inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[var(--mh-fg)] px-5 text-[14px] font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90 ${className}`}
    >
      {children}
    </Link>
  );
}

function portrait(gender: "men" | "women", n: number) {
  return `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;
}

const PREVIEW_LEADS = [
  {
    name: "Maya Okafor",
    title: "Co-Founder",
    company: "Notion",
    domain: "notion.so",
    email: "m.okafor@notion.so",
    photoUrl: portrait("women", 44),
  },
  {
    name: "Daniel Reyes",
    title: "Head of Growth",
    company: "Ramp",
    domain: "ramp.com",
    email: "d.reyes@ramp.com",
    photoUrl: portrait("men", 32),
  },
  {
    name: "Lena Fischer",
    title: "VP Sales",
    company: "Figma",
    domain: "figma.com",
    email: "l.fischer@figma.com",
    photoUrl: portrait("women", 68),
  },
  {
    name: "Sam Adeyemi",
    title: "CEO",
    company: "Vercel",
    domain: "vercel.com",
    email: "s.adeyemi@vercel.com",
    photoUrl: portrait("men", 75),
  },
  {
    name: "Priya Nair",
    title: "Founder",
    company: "Stripe",
    domain: "stripe.com",
    email: "p.nair@stripe.com",
    photoUrl: portrait("women", 12),
  },
  {
    name: "Jonah Adler",
    title: "Head of Sales",
    company: "Linear",
    domain: "linear.app",
    email: "j.adler@linear.app",
    photoUrl: portrait("men", 52),
  },
] as const;

function ProductWindow() {
  return (
    <div className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#111111] text-left text-[#f0f0f0] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#151515] px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="mx-auto rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-1 text-[12px] text-[#9a9a9a]">
          app.apsurn.com/dashboard/prospects
        </span>
        <span className="w-10" aria-hidden />
      </div>

      <div className="grid bg-[#111111] sm:grid-cols-[168px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#151515] p-3 sm:block">
          <div className="mb-4 flex items-center gap-2 px-2.5 pt-1">
            <Image src="/branding/apsurn-gtm.png" alt="" width={22} height={22} className="size-[22px] rounded-[5px]" />
            <span className="text-[15px] font-medium tracking-[-0.03em] text-white">apsurn</span>
          </div>
          <p className="rounded-md px-2.5 py-2 text-[13px] font-medium text-[#9a9a9a]">Home</p>
          <p className="rounded-md bg-[#2c2c2c] px-2.5 py-2 text-[13px] font-semibold text-white">Prospects</p>
          <p className="rounded-md px-2.5 py-2 text-[13px] font-medium text-[#9a9a9a]">Settings</p>
        </aside>

        <div className="min-w-0 p-3 sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-2 px-1">
            <div>
              <p className="text-[12px] font-medium text-[#9a9a9a]">List</p>
              <p className="mt-0.5 text-[16px] font-semibold tracking-[-0.02em] text-white">Seed-stage developer tools</p>
            </div>
            <p className="text-[12px] text-[#9a9a9a]">{PREVIEW_LEADS.length} verified contacts · example</p>
          </div>

          <div className="mt-3 overflow-hidden rounded-[8px] border border-white/10 bg-[#1a1a1a]">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 border-b border-white/10 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-[#737373] sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_auto]">
              <span>Name</span>
              <span>Company</span>
              <span className="hidden sm:block">Verified email</span>
              <span className="hidden sm:block">Status</span>
            </div>
            <ul>
              {PREVIEW_LEADS.map((lead) => (
                <li
                  key={lead.email}
                  className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.06] px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.3fr)_auto]"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ContactAvatar name={lead.name} photoUrl={lead.photoUrl} className="size-9 !bg-[#2c2c2c] !text-[#9a9a9a]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[#f0f0f0]">{lead.name}</span>
                      <span className="block truncate text-[12px] text-[#9a9a9a]">{lead.title}</span>
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-sm text-[#d4d4d4]">
                    <CompanyFavicon domain={lead.domain} name={lead.company} className="size-5" />
                    <span className="truncate">{lead.company}</span>
                  </span>
                  <span className="hidden truncate text-sm text-[#b8b8b8] sm:block">{lead.email}</span>
                  <span className="hidden items-center gap-1 text-[12px] font-medium text-[#34d399] sm:inline-flex">
                    <Check className="size-3.5" strokeWidth={2.5} />
                    Verified
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function BentoLeadsVisual() {
  return (
    <div className="magic-bento__well flex h-full min-h-0 flex-col overflow-hidden p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--mb-muted)]">Example list</p>
      <ul className="mt-2 flex min-h-0 flex-1 flex-col divide-y divide-[var(--mb-line)]">
        {PREVIEW_LEADS.slice(0, 4).map((lead) => (
          <li key={lead.email} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
            <span className="flex min-w-0 items-center gap-2">
              <ContactAvatar name={lead.name} photoUrl={lead.photoUrl} className="size-7 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-[var(--mb-ink)]">{lead.name}</span>
                <span className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--mb-muted)]">
                  <CompanyFavicon domain={lead.domain} name={lead.company} className="size-3 shrink-0" />
                  <span className="truncate">
                    {lead.title} · {lead.company}
                  </span>
                </span>
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Verified
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FEATURE_BENTO_ITEMS = [
  {
    title: "Paste your site",
    description: "apsurn reads your public pages first",
    visual: "analytics" as const,
  },
  {
    title: "Approve the ICP",
    description: "Edit industries, size, regions, and roles",
    visual: "dashboard" as const,
  },
  {
    title: "Verified contacts",
    description: "Named people with email or LinkedIn — the rest are dropped",
    visual: <BentoLeadsVisual />,
    colSpan: 2,
    rowSpan: 2,
  },
  {
    title: "ICP from your site",
    description: "A draft of who should buy, before prospecting starts",
    visual: "automation" as const,
    colSpan: 2,
    rowSpan: 2,
  },
  {
    title: "Evidence on the row",
    description: "Public page and excerpt stay with each contact",
    visual: "integration" as const,
  },
  {
    title: "Copilot on the list",
    description: "Ask for more companies or a tighter ICP",
    visual: "security" as const,
  },
];

export function MarketingHome() {
  const isDark = useIsDark();
  const plans = (["startup", "growth"] as const).map((key) => {
    const plan = PLANS[key];
    return { key, name: plan.name, price: plan.priceUsd, credits: plan.creditsPerMonth, highlight: key === "startup" };
  });

  return (
    <div className="marketing-home relative min-h-screen selection:bg-[var(--mh-fg)] selection:text-[var(--mh-bg)]">
      <SiteFrame />

      {/* Full-bleed page backdrop — above the solid page fill, behind content (both themes) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[56.25rem] overflow-hidden"
      >
        <div className="absolute inset-0 opacity-50 md:opacity-100">
          <ShaderFlow brightness={3} iterations={10} flowSpeed={[0, 0.1]} />
        </div>
      </div>

      <main className="relative z-10 flex flex-col pb-8">
        {/* Hero */}
        <section className="relative w-full">
          <MarketingPillNav />

          <div className="relative mx-auto w-full max-w-[1100px] px-6 pb-20 pt-40 sm:px-10 sm:pb-28 sm:pt-52">
            <FadeIn className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-6 text-center">
              <p className="text-[13px] font-medium tracking-tight text-[var(--mh-muted)]">
                Prospecting for founder-led sales
              </p>
              <h1 className="text-[clamp(40px,5.6vw,64px)] font-medium leading-[1.02] tracking-tight text-[var(--mh-fg)]">
                Find who should buy
                <span className="mt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
                  <span>without</span>
                  <RotatingText
                    texts={ROTATING_LINES}
                    effect="slide"
                    direction="up"
                    highlight
                    highlightColor={isDark ? "#fafafa" : "#0a0a0a"}
                    staggerFrom="last"
                    staggerDuration={0.025}
                    splitLevelClassName="overflow-hidden pb-0.5 sm:pb-1"
                    rotationInterval={2800}
                    mainClassName="align-middle text-[0.88em] font-medium"
                  />
                </span>
              </h1>
              <p className="max-w-[42ch] text-[17px] leading-relaxed tracking-tight text-[color:color-mix(in_srgb,var(--mh-fg)_65%,transparent)] sm:text-[18px]">
                Paste your website. apsurn drafts who should buy, finds them, and only keeps a contact when the email
                verifies. From $30 a month.
              </p>
              <WebsiteForm align="center" />
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                <p className="text-[13px] text-[var(--mh-muted)]">
                  {STARTER_CREDITS} free credits. Charged when those run out.
                </p>
                <a
                  href="#how-it-works"
                  className="mh-focus text-[13px] font-medium text-[var(--mh-fg)] underline decoration-[var(--mh-soft)] underline-offset-4 hover:decoration-[var(--mh-fg)]"
                >
                  See how it works
                </a>
              </div>
            </FadeIn>
          </div>
        </section>

        <div className="relative mx-auto w-full max-w-[1120px] px-5 sm:px-8">
        {/* Product preview */}
        <section className="mt-4 sm:mt-8" aria-label="Product preview">
          <ScaleUnblur delay={0.08} className="w-full">
            <div className="relative w-full overflow-hidden rounded-4xl border border-[var(--mh-soft)] bg-[var(--mh-bg)] p-1.5 shadow-sm">
              <ProductWindow />
            </div>
            <p className="mt-4 text-center text-[13px] text-[var(--mh-muted)]">
              An example list. Real rows keep the public page they came from.
            </p>
          </ScaleUnblur>
        </section>

        {/* Proof */}
        <section className="mt-20 sm:mt-28" aria-label="Proof">
          <div className="overflow-hidden rounded-3xl border border-[var(--mh-soft)] bg-[var(--mh-bg)]">
            <dl className="grid grid-cols-1 divide-y divide-[var(--mh-soft)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                ["10 min", "To a first list"],
                ["Verified", "Or the contact is dropped"],
                ["50", "Free credits to start"],
              ].map(([value, label]) => (
                <div key={label} className="px-6 py-8 text-center">
                  <dt className="font-display text-[36px] font-medium leading-none tracking-tight text-[var(--mh-fg)] sm:text-[40px]">
                    {value}
                  </dt>
                  <dd className="mt-2 text-[13px] text-[var(--mh-muted)]">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Quote */}
        <section className="mt-20 sm:mt-28">
          <blockquote className="mx-auto max-w-[760px] text-center">
            <p className="font-display text-[clamp(26px,3.4vw,40px)] font-medium leading-[1.25] tracking-tight text-[var(--mh-fg)]">
              “The products weren’t the problem. I had{" "}
              <span className="border-b-[5px] border-[color:color-mix(in_srgb,var(--mh-fg)_20%,transparent)]">no distribution.</span>”
            </p>
            <footer className="mt-6 text-[14px] text-[var(--mh-muted)]">
              Keith Katale <span className="opacity-50">· Founder</span>
            </footer>
          </blockquote>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-28 mt-20 sm:mt-28">
          <div className="max-w-[640px]">
            <h2 className="text-[clamp(32px,4.2vw,48px)] font-medium leading-[1.08] tracking-tight text-[var(--mh-fg)]">
              Everything you need to find buyers
            </h2>
          </div>
          <div className="mt-10">
            <MagicBento
              items={FEATURE_BENTO_ITEMS as any}
              columns={4}
              rowHeight={200}
              gap={12}
              radius={20}
              theme={isDark ? "dark" : "light"}
              glowColor={isDark ? "#fafafa" : "#0a0a0a"}
              enableBorderGlow={true}
              enableSpotlight={true}
              spotlightRadius={300}
              clickEffect={true}
            />
          </div>
        </section>

        {/* Compare */}
        <section id="compare" className="scroll-mt-28 mt-20 sm:mt-28">
          <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
            <div>
              <p className="text-[13px] text-[var(--mh-muted)]">Compare</p>
              <h2 className="mt-3 max-w-[16ch] text-[clamp(36px,4.6vw,56px)] font-medium leading-[1.05] tracking-tight text-[var(--mh-fg)]">
                apsurn next to the other ways to start
              </h2>
              <p className="mt-5 max-w-[48ch] text-[16px] leading-relaxed text-[color:color-mix(in_srgb,var(--mh-fg)_60%,transparent)]">
                What it costs to get the first names, how long that takes, and what you walk away with.
              </p>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="text-[14px] font-medium text-[var(--mh-fg)]">This is you</h3>
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {FITS.map((item) => (
                      <li key={item} className="text-[14px] leading-relaxed text-[color:color-mix(in_srgb,var(--mh-fg)_60%,transparent)]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-[14px] font-medium text-[var(--mh-fg)]">This isn’t</h3>
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {MISFITS.map((item) => (
                      <li key={item} className="text-[14px] leading-relaxed text-[var(--mh-muted)]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <aside className="rounded-3xl border border-[var(--mh-soft)] bg-[var(--mh-bg)] p-5 sm:p-6">
              <p className="text-[14px] text-[color:color-mix(in_srgb,var(--mh-fg)_60%,transparent)]">What getting started costs</p>
              <ul className="mt-4 flex flex-col">
                {COSTS.map((row) => (
                  <li
                    key={row.name}
                    className={`flex items-baseline justify-between gap-4 border-t border-[var(--mh-soft)] py-3.5 first:border-t-0 ${
                      "ours" in row && row.ours
                        ? "-mx-3 rounded-xl border-transparent bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] px-3 text-[var(--mh-fg)]"
                        : "text-[color:color-mix(in_srgb,var(--mh-fg)_55%,transparent)]"
                    }`}
                  >
                    <span className="text-[15px]">{row.name}</span>
                    <span className={`text-right text-[15px] ${"ours" in row && row.ours ? "font-medium text-[var(--mh-fg)]" : ""}`}>
                      {row.detail}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--mh-muted)]">Categories, not a price quoted by those companies.</p>
            </aside>
          </div>

          <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {COMPARE_CARDS.map((card) => (
              <li key={card.title} className="project-card flex flex-col rounded-3xl border border-[var(--mh-soft)] bg-[var(--mh-bg)] p-5 sm:p-6">
                <h3 className="text-[18px] font-medium text-[var(--mh-fg)]">{card.title}</h3>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-[color:color-mix(in_srgb,var(--mh-fg)_60%,transparent)]">{card.body}</p>
                <p className="mt-5 text-[13px] text-[var(--mh-fg)]">{card.line}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Founder */}
        <section id="founder" className="scroll-mt-28 mt-20 sm:mt-28">
          <div className="mx-auto w-full max-w-[680px]">
            <h2 className="font-display text-[clamp(32px,4vw,48px)] font-medium leading-[1.08] tracking-tight text-[var(--mh-fg)]">
              Why I built apsurn
            </h2>
            <div className="mt-8 flex flex-col gap-5 text-[17px] leading-[1.7] text-[color:color-mix(in_srgb,var(--mh-fg)_62%,transparent)]">
              <p>I’m Keith. I spent a year building SaaS products that nobody paid for. I’d launch, and then nothing would happen.</p>
              <p>
                I wanted something that would tell me who to sell to and find them, without a sales hire I couldn’t afford. It didn’t exist at my stage, so I built it.
              </p>
              <p>
                apsurn reads your public site, waits for you to approve the ICP, and only saves a company when a named person has a verified email or a LinkedIn profile. The page that contact came from stays on the row.
              </p>
              <p>If you’re stuck on the same problem, write to me. You’ll get a reply from me directly.</p>
            </div>
            <div className="mt-8 flex items-center justify-between gap-4 border-t border-[var(--mh-soft)] pt-6">
              <div>
                <p className="text-[15px] font-medium text-[var(--mh-fg)]">Keith Katale</p>
                <p className="text-[13px] text-[var(--mh-muted)]">Founder, apsurn</p>
              </div>
              <a
                href="mailto:hello@apsurn.com"
                className="mh-focus rounded-sm text-[14px] text-[var(--mh-fg)] underline decoration-[var(--mh-soft)] underline-offset-4 hover:decoration-[var(--mh-fg)]"
              >
                hello@apsurn.com
              </a>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-28 mt-20 sm:mt-28">
          <div className="mx-auto max-w-[640px] text-center">
            <h2 className="text-[clamp(32px,4.2vw,48px)] font-medium leading-[1.08] tracking-tight text-[var(--mh-fg)]">
              Every plan starts with 50 credits
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[color:color-mix(in_srgb,var(--mh-fg)_60%,transparent)]">
              Your card is charged when those credits run out. Cancel anytime.
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-[860px] grid-cols-1 gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <article
                key={plan.key}
                className={`project-card flex flex-col rounded-3xl border bg-[var(--mh-bg)] p-6 sm:p-7 ${
                  plan.highlight ? "border-[color:color-mix(in_srgb,var(--mh-fg)_22%,transparent)]" : "border-[var(--mh-soft)]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[18px] font-medium text-[var(--mh-fg)]">{plan.name}</h3>
                  {plan.highlight ? <span className="text-[12px] text-[var(--mh-muted)]">Start here</span> : null}
                </div>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-[56px] font-medium leading-none tracking-tight text-[var(--mh-fg)]">${plan.price}</span>
                  <span className="text-[15px] text-[var(--mh-muted)]">/month</span>
                </p>
                <p className="mt-3 text-[15px] text-[color:color-mix(in_srgb,var(--mh-fg)_60%,transparent)]">
                  {plan.credits.toLocaleString("en-US")} credits after the free {STARTER_CREDITS} run out.
                </p>
                <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-[14px] text-[color:color-mix(in_srgb,var(--mh-fg)_70%,transparent)]">
                  {(plan.key === "startup"
                    ? ["ICP drafted from your website", "Verified prospects, with evidence", "Copilot and prospect lists", "CSV import"]
                    : ["Everything in Startup", "Higher prospecting volume", "Priority AI throughput"]
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <CtaPill
                  href={`/signup?next=${encodeURIComponent(`/dashboard?trial=${plan.key as PlanKey}`)}`}
                  onClick={() => trackGoal("start_trial", { plan: plan.key })}
                  className="mt-8 w-full"
                >
                  Start with {STARTER_CREDITS} credits
                </CtaPill>
              </article>
            ))}
          </div>
          <p className="mt-8 text-center text-[14px] text-[var(--mh-muted)]">
            Want the first pass done with you?{" "}
            <a
              href={ENTERPRISE_PLAN.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--mh-fg)] underline decoration-[var(--mh-soft)] underline-offset-4 hover:decoration-[var(--mh-fg)]"
            >
              Book a call
            </a>
          </p>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-28 mt-20 sm:mt-28">
          <div className="grid gap-10 lg:grid-cols-[280px_1fr] lg:gap-16">
            <h2 className="font-display text-[clamp(36px,4vw,52px)] font-medium leading-[1.05] tracking-tight text-[var(--mh-fg)] lg:sticky lg:top-28 lg:self-start">
              Questions
            </h2>
            <div className="border-t border-[var(--mh-soft)]">
              {FAQS.map((item) => (
                <details key={item.q} className="group border-b border-[var(--mh-soft)]">
                  <summary className="mh-focus cursor-pointer list-none rounded-sm py-5 text-[16px] text-[var(--mh-fg)] [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-6">
                      {item.q}
                      <span className="text-[var(--mh-muted)] group-open:hidden" aria-hidden>
                        +
                      </span>
                      <span className="hidden text-[var(--mh-muted)] group-open:inline" aria-hidden>
                        –
                      </span>
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-5 text-[15px] leading-relaxed text-[color:color-mix(in_srgb,var(--mh-fg)_60%,transparent)]">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA — contact-card pattern */}
        <section className="mt-20 sm:mt-28">
          <FadeIn>
            <div className="relative w-full overflow-hidden rounded-4xl border border-[var(--mh-soft)] bg-[var(--mh-bg)] p-1.5 shadow-sm">
              <div className="relative w-full overflow-hidden rounded-[1.6rem]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 opacity-45 grayscale dark:opacity-25"
                  style={{ WebkitMaskImage: CARD_FADE_MASK, maskImage: CARD_FADE_MASK }}
                >
                  <ShaderFlow scale={3} brightness={3} />
                </div>
                <div className="relative flex flex-col items-start gap-6 p-6 sm:p-10 md:p-12">
                  <h2 className="font-display max-w-[14ch] text-[clamp(36px,5vw,56px)] font-medium leading-[1.05] tracking-tight text-[var(--mh-fg)]">
                    Paste your site. Keep the list.
                  </h2>
                  <p className="max-w-[40ch] text-[17px] leading-relaxed tracking-tight text-[color:color-mix(in_srgb,var(--mh-fg)_65%,transparent)]">
                    Approve the ICP, then work verified prospects with Copilot.
                  </p>
                  <WebsiteForm />
                  <Link
                    href="#pricing"
                    className="mh-focus text-[14px] text-[var(--mh-muted)] underline decoration-[var(--mh-soft)] underline-offset-4 hover:text-[var(--mh-fg)]"
                  >
                    See pricing
                  </Link>
                </div>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-[var(--mh-soft)] py-12 sm:mt-20">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div>
              <Wordmark />
              <p className="mt-4 max-w-[28ch] text-[14px] leading-relaxed text-[var(--mh-muted)]">
                Source-backed prospecting for founders who are still the sales team.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
              <FooterCol
                title="Product"
                links={[
                  ["#how-it-works", "How it works"],
                  ["#compare", "Compare"],
                  ["#pricing", "Pricing"],
                  ["#faq", "Questions"],
                ]}
              />
              <FooterCol
                title="Company"
                links={[
                  ["#founder", "About"],
                  ["mailto:hello@apsurn.com", "Contact"],
                ]}
              />
              <FooterCol
                title="Legal"
                links={[
                  ["/privacy", "Privacy"],
                  ["/terms", "Terms"],
                ]}
              />
            </div>
          </div>
          <p className="mt-10 text-[13px] text-[var(--mh-muted)]">© 2026 apsurn · Keith Katale</p>
        </footer>
        </div>
      </main>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <p className="text-[14px] text-[var(--mh-fg)]">{title}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map(([href, label]) => (
          <li key={label}>
            <Link href={href} className="mh-focus rounded-sm text-[14px] text-[var(--mh-muted)] hover:text-[var(--mh-fg)]">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
