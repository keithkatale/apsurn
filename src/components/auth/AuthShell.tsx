import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AuthLeadsPreview } from "@/components/auth/AuthLeadsPreview";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page flex min-h-dvh w-full">
      <aside className="auth-visual relative hidden min-h-dvh flex-1 overflow-hidden lg:block">
        <Link href="/" className="auth-back" aria-label="Back to home">
          <ArrowLeft className="size-5" />
        </Link>
        <AuthLeadsPreview />
      </aside>

      <div className="auth-panel flex min-h-dvh w-full flex-1 flex-col">
        <div className="px-6 pt-6 lg:hidden">
          <Link href="/" className="auth-back auth-back-inline" aria-label="Back to home">
            <ArrowLeft className="size-5" />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
