import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SetupWizard } from "@/components/onboarding/SetupWizard";

export const metadata = {
  title: "Setup — apsurn",
  description: "Analyze your site, define campaigns, find accounts, and write outreach.",
};

export default function SetupPage() {
  return (
    <div className="relative h-dvh overflow-hidden bg-[#111111] text-[#f0f0f0]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-x-0 bottom-0 h-[34%] bg-[radial-gradient(rgba(255,255,255,0.55)_0.85px,transparent_0.85px)] [background-size:18px_18px] sm:[background-size:20px_20px]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 38%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 38%)",
          }}
        />
      </div>
      <div className="relative z-10 flex h-full flex-col">
        <nav className="shrink-0">
          <div className="flex w-full items-center justify-between px-6 pt-4 sm:px-10 sm:pt-5 lg:px-12">
            <Link
              href="/"
              className="group inline-flex items-center gap-2 text-sm font-medium text-[#9a9a9a] transition-colors hover:text-[#f0f0f0]"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to home</span>
            </Link>
            <Link href="/dashboard/copilot" className="text-sm font-medium text-[#9a9a9a] hover:text-[#f0f0f0]">
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
