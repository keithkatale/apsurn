"use client";

import { useState } from "react";
import {
  Sparkles,
  Search,
  Mail,
  CheckCircle2,
  TrendingUp,
  Building2,
  ShieldCheck,
  Send,
  Clock,
  ArrowRight,
  Flame,
  Check,
} from "lucide-react";

type Stage = "blueprint" | "prospects" | "sequences" | "crm";

export function InteractivePipeline() {
  const [activeStage, setActiveStage] = useState<Stage>("blueprint");

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Navigation tabs */}
      <div className="flex flex-wrap items-center justify-center gap-2 p-1.5 rounded-xl bg-neutral-200/60 backdrop-blur-xs w-full max-w-2xl mx-auto border border-neutral-300/40">
        <button
          type="button"
          onClick={() => setActiveStage("blueprint")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all cursor-pointer ${
            activeStage === "blueprint"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-600 hover:text-neutral-900 hover:bg-white/40"
          }`}
        >
          <Sparkles className="size-4 text-amber-500" />
          <span>1. Sales Blueprint</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStage("prospects")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all cursor-pointer ${
            activeStage === "prospects"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-600 hover:text-neutral-900 hover:bg-white/40"
          }`}
        >
          <Search className="size-4 text-blue-500" />
          <span>2. Live Prospecting</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStage("sequences")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all cursor-pointer ${
            activeStage === "sequences"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-600 hover:text-neutral-900 hover:bg-white/40"
          }`}
        >
          <Mail className="size-4 text-emerald-500" />
          <span>3. Inbox Sequences</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveStage("crm")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all cursor-pointer ${
            activeStage === "crm"
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-600 hover:text-neutral-900 hover:bg-white/40"
          }`}
        >
          <TrendingUp className="size-4 text-violet-500" />
          <span>4. Lead Lifecycle</span>
        </button>
      </div>

      {/* Stage display container */}
      <div className="relative rounded-2xl border border-neutral-200/90 bg-white p-5 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.06)] overflow-hidden">
        {/* Subtle accent corner glow */}
        <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-neutral-100 blur-3xl opacity-60" />

        {activeStage === "blueprint" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900">Linear Technology, Inc.</span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-medium px-2 py-0.5">
                    Model Confirmed (Gemini 2.5)
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">Generated in 12.4s from https://linear.app</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-md self-start">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                <span>Blueprint Approved</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-4 border border-neutral-200/60">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Target Industries
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className="rounded bg-white px-2 py-1 text-xs font-medium border border-neutral-200 text-neutral-800">
                    B2B SaaS
                  </span>
                  <span className="rounded bg-white px-2 py-1 text-xs font-medium border border-neutral-200 text-neutral-800">
                    DevTools
                  </span>
                  <span className="rounded bg-white px-2 py-1 text-xs font-medium border border-neutral-200 text-neutral-800">
                    Fintech & AI
                  </span>
                </div>
                <div className="text-xs text-neutral-500 mt-2">
                  <span className="font-medium text-neutral-700">Size:</span> 15-250 employees
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-4 border border-neutral-200/60">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Target Buyer Personas
                </div>
                <div className="flex flex-col gap-1.5 mt-1 text-xs">
                  <div className="font-medium text-neutral-800 flex items-center justify-between">
                    <span>VP Engineering</span>
                    <span className="text-[10px] text-neutral-500">Executive</span>
                  </div>
                  <div className="text-[11px] text-neutral-600 line-clamp-1">
                    Pain: Project delays & bloated legacy tracking
                  </div>
                  <div className="font-medium text-neutral-800 flex items-center justify-between mt-1">
                    <span>Head of Product</span>
                    <span className="text-[10px] text-neutral-500">Decision Maker</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-4 border border-neutral-200/60">
                <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Competitors (Grounded)
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {["Jira", "Asana", "Monday.com", "ClickUp"].map((c) => (
                    <span
                      key={c}
                      className="rounded bg-white px-2 py-1 text-xs font-medium border border-neutral-200 text-neutral-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-neutral-500 mt-2">
                  Grounding via live Google Search queries
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200/70 bg-neutral-50/50 p-4 text-xs text-neutral-700">
              <span className="font-semibold text-neutral-900">Extracted Value Proposition:</span>
              <p className="mt-1 text-neutral-600 leading-relaxed">
                &ldquo;The issue tracking tool you&apos;ll actually love using. Built for modern high-performance software teams who need speed, keyboard-first navigation, and automated Git synchronization.&rdquo;
              </p>
            </div>
          </div>
        )}

        {activeStage === "prospects" && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
              <div>
                <span className="font-semibold text-neutral-900">Active Search Run #104</span>
                <span className="ml-2 text-xs text-neutral-500">Query: Series A DevTools (US & EMEA)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 text-blue-700 text-xs px-2.5 py-0.5 font-medium border border-blue-200">
                  Live Crawling & MX Verification
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500">
                    <th className="pb-2.5 font-medium">Company & Domain</th>
                    <th className="pb-2.5 font-medium">Fit Score</th>
                    <th className="pb-2.5 font-medium">Discovered Decision Maker</th>
                    <th className="pb-2.5 font-medium">Email & Verification</th>
                    <th className="pb-2.5 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-neutral-800">
                  <tr>
                    <td className="py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-3.5 text-neutral-400" />
                        <span>Resend, Inc.</span>
                      </div>
                      <span className="text-[11px] text-neutral-400 font-normal">resend.com</span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Flame className="size-3" /> 98%
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="font-medium text-neutral-900">Zeno Rocha</div>
                      <div className="text-[11px] text-neutral-500">Founder & CEO</div>
                    </td>
                    <td className="py-3">
                      <div className="font-mono text-[11px] text-neutral-800">zeno@resend.com</div>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                        <Check className="size-3" /> MX Records Active
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                        Qualified
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-3.5 text-neutral-400" />
                        <span>Supabase, Pte.</span>
                      </div>
                      <span className="text-[11px] text-neutral-400 font-normal">supabase.com</span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Flame className="size-3" /> 95%
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="font-medium text-neutral-900">Paul Copplestone</div>
                      <div className="text-[11px] text-neutral-500">Co-founder & CEO</div>
                    </td>
                    <td className="py-3">
                      <div className="font-mono text-[11px] text-neutral-800">paul@supabase.com</div>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                        <Check className="size-3" /> MX Records Active
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                        Qualified
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td className="py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-3.5 text-neutral-400" />
                        <span>Inngest Inc.</span>
                      </div>
                      <span className="text-[11px] text-neutral-400 font-normal">inngest.com</span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Flame className="size-3" /> 92%
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="font-medium text-neutral-900">Tony Holdstock-Brown</div>
                      <div className="text-[11px] text-neutral-500">Head of Growth</div>
                    </td>
                    <td className="py-3">
                      <div className="font-mono text-[11px] text-neutral-800">tony@inngest.com</div>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                        <Check className="size-3" /> MX Records Active
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                        Enrolled
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-500 bg-neutral-50 p-2.5 rounded-lg border border-neutral-100">
              <span>Provenance: Extracted from public about/team pages and DNS MX verify</span>
              <span className="font-medium text-neutral-800">Zero scraping of gated social platforms</span>
            </div>
          </div>
        )}

        {activeStage === "sequences" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900">
                    Series A Engineering Leaders Cadence
                  </span>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-medium px-2 py-0.5">
                    Active
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Sending from authenticated Gmail (OAuth encrypted at rest)
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-neutral-500">Enrolled:</span>{" "}
                  <span className="font-semibold text-neutral-900">128</span>
                </div>
                <div>
                  <span className="text-neutral-500">Reply Rate:</span>{" "}
                  <span className="font-semibold text-emerald-600">18.4%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1 */}
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900">
                    <Send className="size-3.5 text-neutral-600" /> Step 1 · Immediate
                  </span>
                  <span className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded font-medium">
                    Personalized Hook
                  </span>
                </div>
                <div className="text-xs font-medium text-neutral-800 border-b border-neutral-100 pb-1.5">
                  Subject: Quick question about tracking for &#123;&#123;company&#125;&#125;
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed italic">
                  &ldquo;Hi &#123;&#123;firstName&#125;&#125;, noticed your engineering team is scaling quickly. We built an autonomous SDR pipeline designed to eliminate tracking friction...&rdquo;
                </p>
                <div className="mt-auto text-[10px] text-neutral-400 font-mono">
                  Stop on reply: Enabled
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900">
                    <Clock className="size-3.5 text-neutral-600" /> Step 2 · Wait 3 Days
                  </span>
                  <span className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded font-medium">
                    Social Proof
                  </span>
                </div>
                <div className="text-xs font-medium text-neutral-800 border-b border-neutral-100 pb-1.5">
                  Subject: Re: Quick question about tracking...
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed italic">
                  &ldquo;Following up with how teams similar to &#123;&#123;company&#125;&#125; cut their cycle times by 35% without changing their sprint velocity...&rdquo;
                </p>
                <div className="mt-auto text-[10px] text-neutral-400 font-mono">
                  Same thread reply
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900">
                    <Clock className="size-3.5 text-neutral-600" /> Step 3 · Wait 4 Days
                  </span>
                  <span className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded font-medium">
                    Low-Friction Ask
                  </span>
                </div>
                <div className="text-xs font-medium text-neutral-800 border-b border-neutral-100 pb-1.5">
                  Subject: Re: Quick question about tracking...
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed italic">
                  &ldquo;If the timing isn&apos;t right, no worries at all! Would it make sense to connect next quarter or is someone else leading this initiative?&rdquo;
                </p>
                <div className="mt-auto text-[10px] text-neutral-400 font-mono">
                  Auto-close cadence
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-neutral-100">
              <span className="flex items-center gap-1.5 font-medium text-neutral-800">
                <ShieldCheck className="size-4 text-emerald-600" /> Native Inbox Send (Zero shared blast IP penalties)
              </span>
              <span>Tokens stored encrypted at rest with AES-256-GCM</span>
            </div>
          </div>
        )}

        {activeStage === "crm" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
              <div>
                <span className="font-semibold text-neutral-900">Unified Lead Pipeline</span>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Automated status synchronization driven by sequence replies and intent
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="rounded-md bg-emerald-50 text-emerald-700 px-2.5 py-1 font-semibold border border-emerald-200">
                  +14 Meetings Booked this month
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                <div className="flex items-center justify-between font-semibold text-neutral-700">
                  <span>1. Qualified</span>
                  <span className="text-neutral-400">142</span>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="p-2 bg-white rounded-lg border border-neutral-200 shadow-2xs">
                    <div className="font-medium text-neutral-900">Guillermo Rauch</div>
                    <div className="text-[11px] text-neutral-500">Vercel Inc.</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-neutral-200 shadow-2xs">
                    <div className="font-medium text-neutral-900">Christina Cacioppo</div>
                    <div className="text-[11px] text-neutral-500">Vanta</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                <div className="flex items-center justify-between font-semibold text-neutral-700">
                  <span>2. Contacted</span>
                  <span className="text-neutral-400">89</span>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="p-2 bg-white rounded-lg border border-neutral-200 shadow-2xs">
                    <div className="font-medium text-neutral-900">Zeno Rocha</div>
                    <div className="text-[11px] text-neutral-500">Step 2 Sent (Yesterday)</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-neutral-200 shadow-2xs">
                    <div className="font-medium text-neutral-900">Spenser Skates</div>
                    <div className="text-[11px] text-neutral-500">Step 1 Sent (2d ago)</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                <div className="flex items-center justify-between font-semibold text-neutral-700">
                  <span>3. Replied</span>
                  <span className="text-neutral-400">24</span>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="p-2 bg-white rounded-lg border border-emerald-200 shadow-2xs">
                    <div className="font-medium text-emerald-900 flex items-center justify-between">
                      <span>Tony H.</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.2 rounded font-semibold">Positive</span>
                    </div>
                    <div className="text-[11px] text-neutral-600 line-clamp-1">&ldquo;Let&apos;s chat Thursday 2pm&rdquo;</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 border border-neutral-200/60">
                <div className="flex items-center justify-between font-semibold text-neutral-700">
                  <span>4. Meeting Booked</span>
                  <span className="text-neutral-400">14</span>
                </div>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="p-2 bg-white rounded-lg border border-violet-200 shadow-2xs">
                    <div className="font-medium text-violet-900">Cal.com Invite #482</div>
                    <div className="text-[11px] text-neutral-500">Thursday @ 2:00 PM EST</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
