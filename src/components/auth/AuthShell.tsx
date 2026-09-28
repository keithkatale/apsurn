import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const AUTH_VISUAL =
  "https://cdn.21st.dev/assets/mirror/0d/0d205a1a31d40e927885b0ec5f603407caa10585b5bc6e8b08240402c7417e86.png";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page flex min-h-dvh w-full">
      <aside className="auth-visual relative hidden min-h-dvh flex-1 overflow-hidden lg:block">
        <Link href="/" className="auth-back" aria-label="Back to home">
          <ArrowLeft className="size-5" />
        </Link>
        <img src={AUTH_VISUAL} alt="" className="absolute inset-0 size-full object-cover" />
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
