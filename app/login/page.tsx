import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="auth-skeleton" />}>
        <LoginForm mode="signin" />
      </Suspense>
    </AuthShell>
  );
}

export const dynamic = "force-dynamic";
