import {
  Building2,
  CheckCircle2,
  Globe,
  Mail,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";

/** Compact UI previews that mirror real dashboard surfaces — no FinTech stock PNGs. */

export function BlueprintPreview() {
  return (
    <div className="relative flex min-h-[280px] flex-col overflow-hidden rounded-xl border-2 border-white bg-[#EEEEEE] p-3 sm:min-h-[360px] sm:rounded-2xl sm:p-5">
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-[#F8F9FC] px-3 py-2.5 sm:px-4">
          <Globe className="size-3.5 text-[#4379EE]" />
          <span className="truncate text-[12px] font-medium text-neutral-600 sm:text-[13px]">
            apsurn.com → ICP blueprint
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <CheckCircle2 className="size-3" /> Approved
          </span>
        </div>
        <div className="grid flex-1 gap-3 p-3 sm:grid-cols-2 sm:p-4">
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Industries</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["B2B SaaS", "Developer tools", "Fintech infra"].map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 shadow-xs border border-neutral-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Personas</p>
            <ul className="mt-2 space-y-1.5 text-[12px] text-neutral-800">
              <li className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#4379EE]" /> Head of Growth
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#4379EE]" /> VP Sales
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#4379EE]" /> Founder / CEO
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3 sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Value prop</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-700 sm:text-[13px]">
              Turn a company website into verified pipeline — ICP, discovery, and Gmail sequences in one loop.
            </p>
          </div>
        </div>
      </div>
      <div className="relative z-10 mt-3 flex items-center gap-2 rounded-xl border border-neutral-700 bg-gradient-to-r from-[#333333] to-neutral-950 px-3.5 py-3 text-white shadow-xl sm:px-5 sm:py-3.5">
        <Sparkles className="size-4 shrink-0 text-[#8FB6FF]" />
        <span className="truncate text-[13px] font-medium sm:text-[15px]">
          Generate ICP blueprint from your website
        </span>
        <span className="inline-block h-4 w-0.5 shrink-0 animate-pulse bg-[#4096FF] sm:h-5" />
      </div>
    </div>
  );
}

export function ProspectsPreview() {
  const rows = [
    { name: "Maya Chen", title: "VP Sales", company: "Linear", status: "Verified", ok: true },
    { name: "Jordan Lee", title: "Head of Growth", company: "Vanta", status: "Verified", ok: true },
    { name: "Sam Ortiz", title: "Founder", company: "Ramp", status: "Checking MX…", ok: false },
  ];

  return (
    <div className="relative flex min-h-[280px] flex-col overflow-hidden rounded-xl border-2 border-white bg-[#EEEEEE] p-3 sm:min-h-[360px] sm:rounded-2xl sm:p-5">
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <Search className="size-3.5 text-[#4379EE]" />
            <span className="text-[13px] font-semibold text-neutral-900">Prospects</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
              128 leads
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#4379EE] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
            <Zap className="size-3" /> Find prospects
          </span>
        </div>
        <div className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <div key={row.name} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F4F8FF] text-[12px] font-bold text-[#1650B0]">
                {row.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-neutral-900">{row.name}</p>
                <p className="truncate text-[11px] text-neutral-500">
                  {row.title} · {row.company}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  row.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-auto border-t border-neutral-100 bg-[#F8F9FC] px-3 py-2.5 text-[11px] text-neutral-500 sm:px-4">
          Saved only with verified email or public phone · evidence attached
        </div>
      </div>
    </div>
  );
}

export function SequencePreview() {
  return (
    <div className="relative flex min-h-[280px] flex-col overflow-hidden rounded-xl border-2 border-white bg-[#EEEEEE] p-3 sm:min-h-[360px] sm:rounded-2xl sm:p-5">
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-neutral-100 bg-[#F8F9FC] px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F4F8FF] text-[11px] font-bold text-[#1650B0]">
              SJ
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-neutral-900">Sarah Jenkins</p>
              <p className="truncate text-[11px] text-neutral-500">VP of Sales · stripe.com</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">
            <Zap className="size-3 text-[#4379EE]" /> Step 1
          </span>
        </div>
        <div className="border-b border-neutral-100 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-2 py-1.5">
            <span className="w-9 shrink-0 text-[11px] font-medium text-neutral-400">To</span>
            <span className="truncate text-[12px] text-neutral-800">sarah@stripe.com</span>
            <CheckCircle2 className="ml-auto size-3.5 shrink-0 text-emerald-600" />
          </div>
          <div className="flex items-center gap-2 border-t border-neutral-50 py-1.5">
            <span className="w-9 shrink-0 text-[11px] font-medium text-neutral-400">Subj</span>
            <span className="truncate text-[12px] font-medium text-neutral-900">
              Quick question about Stripe&apos;s outbound motion
            </span>
          </div>
        </div>
        <div className="flex-1 space-y-2 px-3 py-3 text-[12px] leading-relaxed text-neutral-700 sm:px-4 sm:text-[13px]">
          <p>Sarah — noticed you&apos;re hiring SDRs. Curious how you&apos;re sourcing ICP-fit accounts today?</p>
          <p className="text-neutral-500">We built a loop: website → blueprint → verified contacts → Gmail sequence.</p>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-neutral-100 px-3 py-2.5 sm:px-4">
          <span className="text-[10px] font-medium text-neutral-400">AI draft · merge fields ready</span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white">
            <Mail className="size-3" /> Send via Gmail
          </span>
        </div>
      </div>
    </div>
  );
}

export function CampaignWorkspacePreview({ className = "" }: { className?: string }) {
  return (
    <div className={`overflow-hidden rounded-t-[14px] border border-b-0 border-neutral-200 bg-white sm:rounded-t-[22px] ${className}`}>
      <div className="flex items-center gap-2 border-b border-neutral-100 bg-[#F8F9FC] px-3 py-2 sm:px-4">
        <Building2 className="size-3.5 text-[#4379EE]" />
        <span className="text-[12px] font-semibold text-neutral-800 sm:text-[13px]">Campaigns · Series A SaaS</span>
        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          24 enrolled
        </span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-neutral-100">
        <div className="p-3 sm:p-4">
          <p className="text-[10px] font-semibold uppercase text-neutral-400">Opener</p>
          <p className="mt-1 text-[12px] font-medium text-neutral-900">Day 0 · Send now</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-100">
            <div className="h-1.5 w-[80%] rounded-full bg-[#4379EE]" />
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <p className="text-[10px] font-semibold uppercase text-neutral-400">Follow-up</p>
          <p className="mt-1 text-[12px] font-medium text-neutral-900">Day 3 · If no reply</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-100">
            <div className="h-1.5 w-[45%] rounded-full bg-[#4379EE]" />
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <p className="text-[10px] font-semibold uppercase text-neutral-400">Inbox</p>
          <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-neutral-900">
            <Mail className="size-3 text-[#4379EE]" /> Gmail connected
          </p>
          <p className="mt-2 text-[10px] text-neutral-500">MX-verified before send</p>
        </div>
      </div>
      <div className="border-t border-neutral-100 px-3 py-3 sm:px-4">
        <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-neutral-800">Next: 6 openers ready · capacity OK</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Copilot can enroll leads, rewrite drafts, and trigger prospecting runs.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DomainConnectPreview() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-neutral-950 p-4 text-white">
      <div className="w-full max-w-[200px] rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/50">Your website</p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2">
          <Globe className="size-3.5 text-[#8FB6FF]" />
          <span className="truncate text-[12px] text-white/90">stripe.com</span>
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#4379EE] py-2 text-[11px] font-semibold">
          <Sparkles className="size-3" /> Build blueprint
        </div>
      </div>
      <p className="max-w-[180px] text-center text-[10px] leading-relaxed text-white/45">
        Crawl → ICP → campaigns — same flow as /setup
      </p>
    </div>
  );
}

export function ProspectingRunPreview() {
  return (
    <div className="relative flex size-full flex-col bg-neutral-950 p-4">
      <div className="flex-1 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#4379EE] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[#4379EE]" />
          </span>
          <span className="text-[11px] font-semibold text-white">Prospecting run</span>
        </div>
        <ul className="mt-3 space-y-2 text-[11px] text-white/70">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="size-3 text-emerald-400" /> Grounded web search
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="size-3 text-emerald-400" /> Crawl public pages
          </li>
          <li className="flex items-center gap-2">
            <span className="size-3 animate-pulse rounded-full border border-[#8FB6FF]" /> Verify mailboxes…
          </li>
        </ul>
      </div>
    </div>
  );
}

export function SequenceStepsPreview() {
  return (
    <div className="flex size-full flex-col justify-center gap-2 bg-neutral-950 p-4">
      {[
        { label: "Opener", meta: "Send immediately", active: true },
        { label: "Follow-up", meta: "Wait 3 days if no reply", active: false },
        { label: "Bump", meta: "Wait 5 days · stop on reply", active: false },
      ].map((step) => (
        <div
          key={step.label}
          className={`rounded-lg border px-3 py-2 ${
            step.active ? "border-[#4379EE]/60 bg-[#4379EE]/15" : "border-white/10 bg-white/5"
          }`}
        >
          <p className="text-[12px] font-semibold text-white">{step.label}</p>
          <p className="text-[10px] text-white/50">{step.meta}</p>
        </div>
      ))}
    </div>
  );
}
