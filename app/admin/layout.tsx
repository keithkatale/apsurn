import type { Metadata } from 'next'
import { AdminShell } from '@/components/admin/AdminShell'
import { requireAdmin } from '@/lib/admin/access'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()
  return <AdminShell email={user.email ?? ''}>{children}</AdminShell>
}
