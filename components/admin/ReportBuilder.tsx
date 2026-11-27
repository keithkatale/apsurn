'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { runReportStep, startReport, type StepName } from '@/app/admin/reports/actions'

const STEPS: Array<{ id: StepName; label: string }> = [
  { id: 'competitors', label: 'Competitors and positioning' },
  { id: 'leads', label: 'Finding target accounts' },
  { id: 'campaigns', label: 'Writing email sequences' },
  { id: 'finish', label: 'Publishing' },
]

type State = 'idle' | 'running' | 'error' | 'done'

/** Drives the setup pipeline one step at a time. With `resumeId` it continues an unfinished report. */
export function ReportBuilder({ resumeId, resumeLabel }: { resumeId?: string; resumeLabel?: string }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [state, setState] = useState<State>('idle')
  const [phase, setPhase] = useState('')
  const [done, setDone] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(resumeId ?? null)

  async function run(existing: string | null) {
    setState('running')
    setError(null)
    let id = existing
    if (!id) {
      setPhase('Reading the website, building the ICP and blueprint')
      const started = await startReport(url)
      if (!started.ok) {
        setError(started.error)
        setState('error')
        return
      }
      id = started.shareId
      setShareId(id)
    }
    for (const step of STEPS) {
      if (done.includes(step.id) && existing) continue
      setPhase(step.label)
      const result = await runReportStep(id, step.id)
      if (!result.ok) {
        setError(`${step.label}: ${result.error}`)
        setState('error')
        return
      }
      setDone((d) => [...d, step.id])
    }
    setState('done')
    setUrl('')
    router.refresh()
  }

  const busy = state === 'running'

  if (resumeId) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(resumeId)}
          className="rounded-[8px] border border-[var(--mh-soft)] px-2 py-1 text-[11px] font-medium disabled:opacity-50"
        >
          {busy ? `${phase}…` : resumeLabel ?? 'Resume build'}
        </button>
        {error && <span className="max-w-xs whitespace-normal text-[11px] text-red-600">{error}</span>}
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) void run(null)
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          placeholder="Business website, e.g. acme.com"
          className="h-10 flex-1 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm outline-none focus:border-[var(--mh-fg)]"
        />
        <button
          type="submit"
          disabled={busy || url.trim().length < 3}
          className="h-10 rounded-[10px] bg-[var(--mh-fg)] px-5 text-sm font-medium text-[var(--mh-bg)] disabled:opacity-50"
        >
          {busy ? 'Building…' : 'Build report'}
        </button>
      </div>
      {busy && (
        <p className="text-xs text-[var(--mh-muted)]">
          {phase}… This takes a couple of minutes. Keep this tab open.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600">
          {error}{' '}
          {shareId && (
            <button type="button" className="underline" onClick={() => void run(shareId)}>
              Retry from here
            </button>
          )}
        </p>
      )}
      {state === 'done' && <p className="text-xs text-emerald-700">Report ready. Copy its link from the list below.</p>}
    </form>
  )
}
