import { Briefcase, Building2, ExternalLink, Globe, Mail, MapPin, MessageSquareQuote, Phone } from 'lucide-react'
import { INTENT_LABELS, sourceLabel } from '@/lib/source-meta'
import type { ScoredPost } from '@/lib/types'
import { cn } from '@/lib/utils'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function scoreTier(score: number) {
  if (score >= 75) return 'hot'
  if (score >= 45) return 'warm'
  return 'cold'
}

export function SignalCard({ post }: { post: ScoredPost }) {
  const tier = scoreTier(post.score)
  const lead = post.lead

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border font-mono',
            tier === 'hot' && 'border-signal/40 bg-signal/15 text-signal',
            tier === 'warm' && 'border-warm/40 bg-warm/10 text-warm',
            tier === 'cold' && 'text-muted-foreground',
          )}
        >
          <span className="text-lg leading-none font-semibold">{post.score}</span>
          <span className="sr-only">fit score out of 100</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
            <span className="text-foreground">{sourceLabel(post.source)}</span>
            {post.community && <span className="truncate">· {post.community}</span>}
            {!lead && post.author && <span className="truncate">· {post.author}</span>}
            {!lead && <time dateTime={post.createdAt}>· {timeAgo(post.createdAt)}</time>}
            {lead?.seniority && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase">{lead.seniority}</span>}
          </div>
          {post.title && <h3 className="font-medium leading-snug text-pretty">{post.title}</h3>}

          {lead && (
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-signal/30 bg-signal/10 px-2.5 py-1 font-mono text-signal hover:bg-signal/20"
                >
                  <Mail className="size-3.5" aria-hidden />
                  {lead.email}
                </a>
              )}
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 font-mono hover:bg-accent"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {lead.phone}
                </a>
              )}
              {lead.linkedinUrl && (
                <a
                  href={lead.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 hover:bg-accent"
                >
                  <Briefcase className="size-3.5" aria-hidden />
                  LinkedIn
                </a>
              )}
              {lead.companyWebsite && (
                <a
                  href={lead.companyWebsite.startsWith('http') ? lead.companyWebsite : `https://${lead.companyWebsite}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 hover:bg-accent"
                >
                  <Globe className="size-3.5" aria-hidden />
                  Website
                </a>
              )}
              {lead.companyIndustry && (
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-muted-foreground">
                  <Building2 className="size-3" aria-hidden />
                  {lead.companyIndustry}
                  {lead.companySize ? ` · ${lead.companySize}` : ''}
                </span>
              )}
              {lead.location && (
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-muted-foreground">
                  <MapPin className="size-3" aria-hidden />
                  {lead.location}
                </span>
              )}
            </div>
          )}

          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground text-pretty">{post.text}</p>
        </div>
      </div>

      {(post.reason || post.outreachAngle) && (
        <div className="flex flex-col gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
          {post.reason && (
            <p className="leading-relaxed">
              <span className="font-medium">{INTENT_LABELS[post.intent]}: </span>
              <span className="text-muted-foreground">{post.reason}</span>
            </p>
          )}
          {post.outreachAngle && (
            <p className="flex gap-2 leading-relaxed text-muted-foreground">
              <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
              <span>{post.outreachAngle}</span>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">matched: {post.keyword}</span>
        <a
          href={post.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-signal hover:underline"
        >
          Open post
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in new tab)</span>
        </a>
      </div>
    </article>
  )
}
