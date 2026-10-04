import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAccessError, requireAdminUser } from "@/lib/auth/admin";
import { AuthenticationError } from "@/lib/auth/session";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SupportInbox } from "@/components/admin/SupportInbox";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
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
  const { id } = await searchParams;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-5">
            <BrandLogo href="/dashboard" size={24} />
            <nav className="flex gap-4 text-sm">
              <Link href="/admin" className="text-neutral-500 hover:text-neutral-900">
                Settings
              </Link>
              <Link href="/admin/support" className="font-semibold text-neutral-900">
                Support
              </Link>
            </nav>
          </div>
          <span className="text-xs text-neutral-400">{admin.email}</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">
        <h1 className="mb-4 text-xl font-semibold text-neutral-900">Support</h1>
        <SupportInbox initialId={id} />
      </div>
    </div>
  );
}
