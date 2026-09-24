import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HeroBackdrop } from "@/components/landing/HeroBackdrop";
import { SetupWizard } from "@/components/onboarding/SetupWizard";

export const metadata = {
  title: "Setup — apsurn",
  description: "Analyze your site, define campaigns, find accounts, and write outreach.",
};

export default function SetupPage() {
  return (
    <div className="relative h-dvh overflow-hidden bg-white text-neutral-900">
      <HeroBackdrop />
      <div className="relative z-10 flex h-full flex-col">
        <nav className="shrink-0">
          <div className="flex w-full items-center justify-between px-6 pt-4 sm:px-10 sm:pt-5 lg:px-12">
            <Link
              href="/"
              className="group inline-flex items-center gap-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to home</span>
            </Link>
            <Link href="/dashboard/copilot" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
              Go to dashboard
            </Link>
          </div>
        </nav>

        <main className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col px-4 pb-4 pt-3 sm:px-8 lg:px-10">
          <SetupWizard />
        </main>
      </div>
    </div>
  );
}
