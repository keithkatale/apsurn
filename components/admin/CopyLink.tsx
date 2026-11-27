'use client'

import { useState } from 'react'

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="rounded-[8px] border border-[var(--mh-soft)] px-2 py-1 text-[11px] font-medium hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          window.prompt('Copy this link', url)
        }
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}
