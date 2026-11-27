import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/AuthShell'
import { MagicConfirm } from '@/components/auth/MagicConfirm'

export const dynamic = 'force-dynamic'
// The token is in the URL, so keep it out of referrers and search engines.
export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function MagicPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return (
    <AuthShell>
      <MagicConfirm token={typeof token === 'string' ? token : ''} />
    </AuthShell>
  )
}
