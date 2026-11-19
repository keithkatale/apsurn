'use client'

import { Loader2, Plus, Radar, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SOURCES } from '@/lib/source-meta'
import type { SourceId } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  keywords: string[]
  hashtags: string[]
  sources: SourceId[]
  onKeywordsChange: (k: string[]) => void
  onHashtagsChange: (h: string[]) => void
  onSourcesChange: (s: SourceId[]) => void
  onRun: () => void
  running: boolean
}

function TagEditor({
  id,
  label,
  items,
  onChange,
  prefix = '',
  max,
  placeholder,
}: {
  id: string
  label: string
  items: string[]
  onChange: (v: string[]) => void
  prefix?: string
  max: number
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const value = draft.trim().replace(/^#/, '')
    if (!value || items.includes(value) || items.length >= max) return
    onChange([...items, value])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="font-mono text-xs text-muted-foreground">
          {items.length}/{max}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-1 rounded-md border bg-secondary py-1 pr-1 pl-2.5 font-mono text-xs">
            {prefix}
            {item}
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i !== item))}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`Remove ${item}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault()
              add()
            }
          }}
          className="h-8 font-mono text-xs"
          disabled={items.length >= max}
        />
        <Button type="button" variant="secondary" size="sm" className="h-8" onClick={add} disabled={!draft.trim() || items.length >= max}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>
    </div>
  )
}

export function ListeningConfig(props: Props) {
  const toggleSource = (id: SourceId) =>
    props.onSourcesChange(props.sources.includes(id) ? props.sources.filter((s) => s !== id) : [...props.sources, id])

  return (
    <section aria-labelledby="listening-heading" className="flex flex-col gap-6 rounded-xl border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 id="listening-heading" className="text-lg font-semibold tracking-tight">
          Social listening
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Generated from your ICP. Edit the intent phrases, then scan public communities for posts from the last 7 days.
        </p>
      </div>

      <TagEditor
        id="keyword-input"
        label="Intent keywords"
        items={props.keywords}
        onChange={props.onKeywordsChange}
        max={12}
        placeholder="e.g. alternative to hubspot"
      />
      <TagEditor
        id="hashtag-input"
        label="Hashtags (Mastodon)"
        items={props.hashtags}
        onChange={props.onHashtagsChange}
        prefix="#"
        max={5}
        placeholder="e.g. saas"
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Sources</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOURCES.map((source) => {
            const active = props.sources.includes(source.id)
            return (
              <button
                key={source.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSource(source.id)}
                className={cn(
                  'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors',
                  active ? 'border-signal/50 bg-signal/10' : 'opacity-60 hover:opacity-100',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={cn('size-2 rounded-full', active ? 'bg-signal' : 'bg-muted-foreground')} aria-hidden />
                  {source.label}
                </span>
                <span className="text-xs text-muted-foreground">{source.note}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <Button
        onClick={props.onRun}
        disabled={props.running || props.keywords.length === 0 || props.sources.length === 0}
        className="h-11 text-base"
      >
        {props.running ? <Loader2 className="animate-spin" aria-hidden /> : <Radar aria-hidden />}
        {props.running ? 'Listening across the web…' : 'Find intent signals'}
      </Button>
    </section>
  )
}
