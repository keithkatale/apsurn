import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function LoginPage() {
  return (
    <AuthShell>
      <div className="w-full max-w-sm rounded-2xl border border-[#EEEEEE] bg-white p-6 sm:p-8">
        <BrandLogo href="/" size={28} className="mb-6" />
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-neutral-950">Sign in to apsurn</h1>
        <p className="mt-2 text-sm text-neutral-600">Use your business email to manage private prospect lists.</p>
        <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-xl bg-neutral-100" />}>
          <LoginForm mode="signin" />
        </Suspense>
      </div>
    </AuthShell>
  );
}

export const dynamic = "force-dynamic";
