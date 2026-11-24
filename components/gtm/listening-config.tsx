'use client'

import { KeyRound, Loader2, Plus, Radar, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SOURCES } from '@/lib/source-meta'
import { SENIORITY_OPTIONS, type SeniorityId, type SourceId } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  personTitle: string[]
  keywords: string[]
  personCountry: string[]
  seniority: SeniorityId[]
  hashtags: string[]
  sources: SourceId[]
  apifyToken: string
  onPersonTitleChange: (t: string[]) => void
  onKeywordsChange: (k: string[]) => void
  onPersonCountryChange: (c: string[]) => void
  onSeniorityChange: (s: SeniorityId[]) => void
  onHashtagsChange: (h: string[]) => void
  onSourcesChange: (s: SourceId[]) => void
  onApifyTokenChange: (t: string) => void
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

  const toggleSeniority = (id: SeniorityId) =>
    props.onSeniorityChange(props.seniority.includes(id) ? props.seniority.filter((s) => s !== id) : [...props.seniority, id])

  const apifyActive = props.sources.includes('apify')

  return (
    <section aria-labelledby="listening-heading" className="flex flex-col gap-5 rounded-xl border bg-card p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 id="listening-heading" className="text-lg font-semibold tracking-tight">
            Apify Lead Generation
          </h2>
          <span className="rounded bg-signal/15 px-2 py-0.5 font-mono text-[11px] text-signal">peakydev/leads-scraper-ppe</span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Auto-configured from your ICP. Pulls verified B2B decision-makers with work emails, direct dials, and LinkedIn profiles via Apify.
        </p>
      </div>

      {apifyActive && (
        <>
          <TagEditor
            id="title-input"
            label="Target job titles (personTitle)"
            items={props.personTitle}
            onChange={props.onPersonTitleChange}
            max={15}
            placeholder="e.g. VP Marketing, CTO, Founder"
          />

          <TagEditor
            id="country-input"
            label="Target countries (personCountry)"
            items={props.personCountry}
            onChange={props.onPersonCountryChange}
            max={8}
            placeholder="e.g. United States, United Kingdom"
          />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Seniority levels</span>
            <div className="flex flex-wrap gap-1.5">
              {SENIORITY_OPTIONS.map((opt) => {
                const active = props.seniority.includes(opt.id)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleSeniority(opt.id)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 font-mono text-xs transition-colors',
                      active ? 'border-signal/50 bg-signal/15 text-signal' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      <TagEditor
        id="keyword-input"
        label={apifyActive ? 'Company / industry keywords (webKeywords)' : 'Intent keywords'}
        items={props.keywords}
        onChange={props.onKeywordsChange}
        max={12}
        placeholder="e.g. SaaS, fintech, software"
      />

      {props.sources.includes('mastodon') && (
        <TagEditor
          id="hashtag-input"
          label="Hashtags (Mastodon)"
          items={props.hashtags}
          onChange={props.onHashtagsChange}
          prefix="#"
          max={5}
          placeholder="e.g. saas"
        />
      )}

      {apifyActive && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="apify-token-input" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <KeyRound className="size-3.5" aria-hidden />
            Apify API Token (optional override)
          </label>
          <Input
            id="apify-token-input"
            type="password"
            value={props.apifyToken}
            onChange={(e) => props.onApifyTokenChange(e.target.value)}
            placeholder="Uses APIFY_API_TOKEN from .env.local by default"
            className="h-8 font-mono text-xs"
          />
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Lead Sources</legend>
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
                  source.id === 'apify' && 'sm:col-span-2',
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
        disabled={props.running || props.sources.length === 0 || (!apifyActive && props.keywords.length === 0)}
        className="h-11 text-base"
      >
        {props.running ? <Loader2 className="animate-spin" aria-hidden /> : <Radar aria-hidden />}
        {props.running ? 'Extracting & scoring leads…' : 'Generate B2B Leads'}
      </Button>
    </section>
  )
}
