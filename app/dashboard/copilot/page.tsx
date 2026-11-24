import { Suspense } from 'react'
import { GtmApp } from '@/components/gtm/gtm-app'

export default function DashboardCopilotPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <GtmApp />
    </Suspense>
  )
}
