import { redirect } from "next/navigation";
import { AdminAccessError } from "@/lib/auth/admin";
import { AuthenticationError } from "@/lib/auth/session";
import { requireAdminUser } from "@/lib/auth/admin";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AiProviderSettings } from "@/components/settings/AiProviderSettings";

export default async function AdminPage() {
  let admin: { id: string; email: string };
  try {
    admin = await requireAdminUser();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/login");
    if (error instanceof AdminAccessError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 text-center">
            <BrandLogo href="/" size={28} className="mx-auto mb-6" />
            <h1 className="text-lg font-semibold text-neutral-900">Not authorized</h1>
            <p className="mt-2 text-sm text-neutral-500">This page is restricted to platform admins.</p>
          </div>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <BrandLogo href="/dashboard/copilot" size={24} />
          <span className="text-xs text-neutral-400">{admin.email}</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <header>
          <h1 className="text-xl font-semibold text-neutral-900">Admin</h1>
          <p className="text-neutral-600">Platform-wide configuration — affects every account, not just yours.</p>
        </header>

        <AiProviderSettings />
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
