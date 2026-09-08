import Link from "next/link";
import { ArrowLeft, Sparkles, ShieldCheck, Database, Mail } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export const metadata = {
  title: "Setup & Company Blueprint — apsurn",
  description: "Generate your AI-powered Ideal Customer Profile blueprint from your website.",
};

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Header bar */}
      <nav className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to home</span>
          </Link>

          <Link href="/dashboard" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Go to dashboard
          </Link>
        </div>
      </nav>

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12 md:py-16">
        <header className="flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-xs">
            <Sparkles className="size-3.5 text-neutral-800" />
            <span>Step 1 · AI Sales Blueprint</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            Build your company blueprint
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed">
            Enter your company&apos;s website URL. Our crawler analyzes your homepage, value proposition, and product pages to formulate your Ideal Customer Profile (ICP), target personas, and market positioning.
          </p>
        </header>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 md:p-8 shadow-xs">
          <OnboardingForm />
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="flex flex-col gap-2 rounded-lg border border-neutral-200/70 bg-white/70 p-4 text-xs text-neutral-600">
            <div className="flex items-center gap-2 font-medium text-neutral-900">
              <Database className="size-4 text-neutral-800" />
              <span>Deep Website Crawl</span>
            </div>
            <p>Heuristically extracts key pages, features, pricing, and value propositions.</p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-neutral-200/70 bg-white/70 p-4 text-xs text-neutral-600">
            <div className="flex items-center gap-2 font-medium text-neutral-900">
              <ShieldCheck className="size-4 text-neutral-800" />
              <span>Competitor Discovery</span>
            </div>
            <p>Live search-grounded recall to map who you compete against in the market.</p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-neutral-200/70 bg-white/70 p-4 text-xs text-neutral-600">
            <div className="flex items-center gap-2 font-medium text-neutral-900">
              <Mail className="size-4 text-neutral-800" />
              <span>Ready for Outreach</span>
            </div>
            <p>Powers downstream prospecting queries, fit scoring, and sequence drafts.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
