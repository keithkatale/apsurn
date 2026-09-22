import { HeroBackdrop } from "@/components/landing/HeroBackdrop";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-neutral-900">
      <HeroBackdrop />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        {children}
      </div>
    </div>
  );
}
