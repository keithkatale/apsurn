import { Suspense } from 'react'
import { LeadTableWorkspace } from '@/components/leads/LeadTableWorkspace'

export default async function TablePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <Suspense>
      <LeadTableWorkspace tableId={id} />
    </Suspense>
  )
}
