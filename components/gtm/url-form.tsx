'use client'

import { ArrowRight, Globe, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = {
  onSubmit: (url: string) => void
  loading: boolean
  compact?: boolean
  defaultValue?: string
}

export function UrlForm({ onSubmit, loading, compact, defaultValue = '' }: Props) {
  const [value, setValue] = useState(defaultValue)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (value.trim()) onSubmit(value.trim())
      }}
      className={compact ? 'flex w-full gap-2' : 'flex w-full flex-col gap-2 sm:flex-row'}
    >
      <label htmlFor="business-url" className="sr-only">
        Business website URL
      </label>
      <div className="relative flex-1">
        <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id="business-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="yourcompany.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={compact ? 'h-9 pl-9 font-mono text-sm' : 'h-12 pl-10 font-mono text-base'}
          disabled={loading}
        />
      </div>
      <Button type="submit" disabled={loading || !value.trim()} className={compact ? 'h-9 px-4' : 'h-12 px-6 text-base'}>
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowRight aria-hidden />}
        {loading ? 'Analyzing' : compact ? 'Re-analyze' : 'Analyze business'}
      </Button>
    </form>
  )
}
