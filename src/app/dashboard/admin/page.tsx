import { AiProviderSettings } from "@/components/settings/AiProviderSettings";

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-900">Admin</h1>
        <p className="text-neutral-600">Platform-wide configuration — affects every account, not just yours.</p>
      </header>

      <AiProviderSettings />
    </div>
  );
}

export const dynamic = "force-dynamic";
