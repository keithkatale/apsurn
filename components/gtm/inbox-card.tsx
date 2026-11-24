'use client'

import { useCallback, useEffect, useState } from 'react'
import { ConnectGoogleModal, GoogleLogo } from '@/components/inbox/ConnectGoogleModal'
import { ThreeDButton } from '@/components/buttons/three-d-button'

type InboxRow = {
  id: string
  provider: string
  email_address: string
  status: string
}

export function InboxCard() {
  const [inboxes, setInboxes] = useState<InboxRow[] | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/inboxes/smtp', { cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as { inboxes?: InboxRow[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error || 'Could not load inbox')
      setInboxes(data?.inboxes ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load inbox')
      setInboxes([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const connected = inboxes?.[0] ?? null

  async function disconnect() {
    if (!connected || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/inboxes/smtp', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inboxId: connected.id }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error || 'Could not disconnect')
      setInboxes([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white">
            <GoogleLogo className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Inbox</h3>
            <p className="mt-0.5 text-[13px] text-neutral-600">
              {inboxes === null
                ? 'Checking connection…'
                : connected
                  ? connected.email_address
                  : 'Campaigns cannot send until you connect a Gmail inbox.'}
            </p>
          </div>
        </div>

        {inboxes !== null && (
          connected ? (
            <div className="flex items-center gap-2">
              <ThreeDButton type="button" variant="soft" size="sm" disabled={busy} onClick={() => setConnectOpen(true)}>
                Reconnect
              </ThreeDButton>
              <ThreeDButton type="button" variant="muted" size="sm" disabled={busy} onClick={() => void disconnect()}>
                {busy ? 'Disconnecting…' : 'Disconnect'}
              </ThreeDButton>
            </div>
          ) : (
            <ThreeDButton type="button" variant="solid" size="sm" onClick={() => setConnectOpen(true)}>
              Connect Gmail
            </ThreeDButton>
          )
        )}
      </div>

      {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

      <ConnectGoogleModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        defaultEmail={connected?.email_address ?? ''}
        onConnected={() => {
          setError(null)
          void load()
        }}
      />
    </section>
  )
}
