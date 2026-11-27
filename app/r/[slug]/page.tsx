import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ReportView } from '@/components/reports/ReportView'
import { getReportBySlug } from '@/lib/reports'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const report = await getReportBySlug(slug)
  return {
    title: report ? `${report.company.name}: outbound plan` : 'Report',
    description: report?.profile?.oneLiner,
    robots: { index: false, follow: false, nocache: true },
  }
}

export default async function ReportPage({ params }: Props) {
  const { slug } = await params
  const report = await getReportBySlug(slug)
  if (!report) notFound()
  return <ReportView report={report} slug={slug} />
}
