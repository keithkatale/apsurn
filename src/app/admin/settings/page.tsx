import { AdminShell, requireAdminPage } from "@/components/admin/AdminShell";
import { AiProviderSettings } from "@/components/settings/AiProviderSettings";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = await requireAdminPage();
  return (
    <AdminShell active="/admin/settings" email={admin.email} title="AI settings" subtitle="Platform-wide configuration. It affects every account, not just yours.">
      <div className="max-w-3xl">
        <AiProviderSettings />
      </div>
    </AdminShell>
  );
}
