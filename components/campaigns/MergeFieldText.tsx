'use client'

import { useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import {
  leadMergeVars,
  normalizeMergeKey,
  parseMergeSegments,
  type LeadMergeSource,
  type MergeFieldKey,
} from '@/lib/outreach/merge-fields'

function chipLabel(key: MergeFieldKey, lead: LeadMergeSource | null | undefined): string {
  const vars = leadMergeVars(lead)
  return vars[key] || key.replace(/_/g, ' ')
}

function FieldChip({
  fieldKey,
  lead,
  onReplace,
}: {
  fieldKey: MergeFieldKey
  lead: LeadMergeSource | null | undefined
  onReplace: (nextRaw: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const label = chipLabel(fieldKey, lead)

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={`{{${fieldKey}}}`}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => {
          onReplace(event.target.value)
          setEditing(false)
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onReplace((event.target as HTMLInputElement).value)
            setEditing(false)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setEditing(false)
          }
        }}
        className="mx-0.5 inline-block min-w-[5rem] rounded-md border border-[var(--mh-fg)] bg-[var(--mh-bg)] px-1.5 py-0.5 align-baseline font-mono text-[12px] text-[var(--mh-fg)] outline-none"
        aria-label={`Edit {{${fieldKey}}}`}
      />
    )
  }

  return (
    <button
      type="button"
      data-merge-chip
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
      title={`{{${fieldKey}}} — click to edit`}
      className="mx-0.5 inline-flex max-w-[16rem] items-center truncate rounded-md border border-[var(--mh-soft)] bg-[#FBEAE2] px-2 py-0.5 align-baseline text-[13px] font-medium text-[#9A3B12] transition-colors hover:bg-[#F7D9CB] dark:bg-[color:color-mix(in_srgb,var(--mh-fg)_12%,transparent)] dark:text-[var(--mh-fg)]"
    >
      {label}
    </button>
  )
}

export function MergeFieldText({
  value,
  onChange,
  lead,
  multiline = false,
  placeholder,
  className,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  lead: LeadMergeSource | null | undefined
  multiline?: boolean
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const [editingFull, setEditingFull] = useState(false)
  const [draft, setDraft] = useState(value)
  const segments = parseMergeSegments(value)
  const empty = !value.trim()
  const showEditor = editingFull || empty

  function startFullEdit() {
    setDraft(value)
    setEditingFull(true)
  }

  function commitFull(next: string) {
    onChange(next)
    setDraft(next)
    setEditingFull(false)
  }

  function replaceSegment(index: number, nextRaw: string) {
    const next = segments
      .map((segment, i) => {
        if (i !== index) return segment.type === 'field' ? segment.raw : segment.value
        const trimmed = nextRaw.trim()
        const match = /^\{\{\s*(\w+)\s*\}\}$/.exec(trimmed)
        if (match) {
          const mapped = normalizeMergeKey(match[1])
          if (mapped) return `{{${mapped}}}`
        }
        const direct = normalizeMergeKey(trimmed)
        if (direct) return `{{${direct}}}`
        return nextRaw
      })
      .join('')
    onChange(next)
  }

  if (disabled) {
    return <p className={cn('text-[13px] text-[var(--mh-muted)]', className)}>{placeholder}</p>
  }

  if (showEditor) {
    return (
      <textarea
        autoFocus={editingFull}
        className={cn(
          'w-full bg-transparent text-[14px] leading-relaxed text-[var(--mh-fg)] outline-none placeholder:text-[var(--mh-muted)]',
          multiline ? 'min-h-[10rem] resize-y' : 'h-7 resize-none overflow-hidden',
          className,
        )}
        value={editingFull ? draft : value}
        placeholder={placeholder}
        rows={multiline ? 7 : 1}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          setEditingFull(true)
          if (empty || !multiline) onChange(next)
        }}
        onBlur={(event) => commitFull(event.target.value)}
        onKeyDown={(event) => {
          if (!multiline && event.key === 'Enter') {
            event.preventDefault()
            commitFull((event.target as HTMLTextAreaElement).value)
          }
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        'w-full cursor-text rounded-md text-left text-[14px] leading-relaxed text-[var(--mh-fg)]',
        multiline ? 'min-h-[10rem] whitespace-pre-wrap' : 'min-h-7',
        className,
      )}
      role="textbox"
      tabIndex={0}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('[data-merge-chip]')) return
        startFullEdit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          if ((event.target as HTMLElement).closest('[data-merge-chip]')) return
          event.preventDefault()
          startFullEdit()
        }
      }}
    >
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`t-${index}`}>{segment.value}</span>
        }
        return (
          <FieldChip
            key={`${segment.key}-${index}`}
            fieldKey={segment.key}
            lead={lead}
            onReplace={(raw) => replaceSegment(index, raw)}
          />
        )
      })}
    </div>
  )
}
