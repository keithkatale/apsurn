'use client'

import { ArrowRight, Loader2 } from 'lucide-react'
import { useState } from 'react'

type Props = {
  onSubmit: (url: string) => void
  loading: boolean
  compact?: boolean
  defaultValue?: string
}

function cleanDomainInput(raw: string) {
  return raw.replace(/^\s+/, '').replace(/^(https?:\/\/)+/i, '')
}

export function UrlForm({ onSubmit, loading, compact, defaultValue = '' }: Props) {
  const [value, setValue] = useState(() => cleanDomainInput(defaultValue))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
      className={compact ? 'flex w-full gap-2' : 'mx-auto w-full max-w-[560px]'}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex h-12 min-w-0 flex-1 items-center rounded-full border border-[var(--mh-soft)] bg-[var(--mh-bg)] px-4">
          <span className="shrink-0 select-none text-[15px] text-[var(--mh-muted)]">https://</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="yourcompany.com"
            value={value}
            onChange={(e) => setValue(cleanDomainInput(e.target.value))}
            disabled={loading}
            className="min-w-0 flex-1 bg-transparent py-2 pl-1 text-[16px] text-[var(--mh-fg)] outline-none placeholder:text-[color:color-mix(in_srgb,var(--mh-fg)_35%,transparent)]"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="mh-focus inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[var(--mh-fg)] px-5 text-[15px] font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>Scanning</span>
            </>
          ) : (
            <>
              <span>{compact ? 'Rescan' : 'Analyze site'}</span>
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </button>
      </div>
    </form>
  )
}
