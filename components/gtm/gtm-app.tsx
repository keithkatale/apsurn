'use client'

import { AlertCircle, Radar } from 'lucide-react'
import { useState } from 'react'
import useSWRMutation from 'swr/mutation'
import { Skeleton } from '@/components/ui/skeleton'
import { postJson } from '@/lib/post-json'
import { SOURCES } from '@/lib/source-meta'
import type { AnalyzeResponse, ListenResponse, SourceId } from '@/lib/types'
import { BusinessProfile } from './business-profile'
import { ListeningConfig } from './listening-config'
import { SignalFeed, SignalFeedSkeleton } from './signal-feed'
import { UrlForm } from './url-form'

const STEPS = ['Read website', 'Model business & ICP', 'Generate intent keywords', 'Listen (last 7 days)', 'Score intent']

export function GtmApp() {
  const [keywords, setKeywords] = useState<string[]>([])
  const [hashtags, setHashtags] = useState<string[]>([])
  const [sources, setSources] = useState<SourceId[]>(SOURCES.map((s) => s.id))

  const analyze = useSWRMutation('/api/analyze', postJson<AnalyzeResponse>, {
    onSuccess: (data) => {
      setKeywords(data.profile.keywords.slice(0, 12))
      setHashtags(data.profile.hashtags.slice(0, 5))
      listen.reset()
    },
  })
  const listen = useSWRMutation('/api/listen', postJson<ListenResponse>)

  const runAnalyze = (url: string) => analyze.trigger({ url }).catch(() => {})
  const runListen = () => {
    if (!analyze.data) return
    listen.trigger({ profile: analyze.data.profile, keywords, hashtags, sources }).catch(() => {})
  }

  const hasProfile = !!analyze.data

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-signal text-signal-foreground">
              <Radar className="size-4" aria-hidden />
            </span>
            <span className="font-semibold tracking-tight">Signal</span>
          </div>
          {hasProfile && (
            <div className="ml-auto w-full max-w-md">
              <UrlForm compact onSubmit={runAnalyze} loading={analyze.isMutating} defaultValue={analyze.data?.url} />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
        {!hasProfile && (
          <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-10 text-center md:py-20">
            <span className="rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground">
              GTM intelligence · no paid scraping APIs
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
              Find buyers who are asking for you <span className="text-signal">right now.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
              Paste your website. We map your business model and ICP, then listen across Reddit, Hacker News, Bluesky,
              Mastodon and more for posts from the last 7 days showing real purchase intent.
            </p>
            <div className="w-full">
              <UrlForm onSubmit={runAnalyze} loading={analyze.isMutating} />
            </div>
            {analyze.isMutating && <Progress active={1} />}
            {analyze.error && <ErrorNote message={analyze.error.message} />}
          </section>
        )}

        {hasProfile && analyze.isMutating && (
          <div className="mb-6">
            <Progress active={1} />
          </div>
        )}
        {hasProfile && analyze.error && (
          <div className="mb-6">
            <ErrorNote message={analyze.error.message} />
          </div>
        )}

        {hasProfile && analyze.data && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex min-w-0 flex-col gap-8">
              <BusinessProfile profile={analyze.data.profile} url={analyze.data.url} pagesRead={analyze.data.pagesRead} />

              {listen.isMutating && (
                <div className="flex flex-col gap-4">
                  <Progress active={3} />
                  <SignalFeedSkeleton />
                </div>
              )}
              {listen.error && !listen.isMutating && <ErrorNote message={listen.error.message} />}
              {listen.data && !listen.isMutating && <SignalFeed data={listen.data} />}
            </div>

            <aside className="lg:sticky lg:top-20 lg:self-start">
              <ListeningConfig
                keywords={keywords}
                hashtags={hashtags}
                sources={sources}
                onKeywordsChange={setKeywords}
                onHashtagsChange={setHashtags}
                onSourcesChange={setSources}
                onRun={runListen}
                running={listen.isMutating}
              />
            </aside>
          </div>
        )}

        {!hasProfile && analyze.isMutating && (
          <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function Progress({ active }: { active: number }) {
  return (
    <ol className="flex w-full flex-wrap justify-center gap-2" aria-live="polite">
      {STEPS.map((step, i) => (
        <li
          key={step}
          className={`flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-xs ${
            i < active ? 'text-muted-foreground' : i === active ? 'border-signal/50 text-signal' : 'text-muted-foreground/50'
          }`}
        >
          <span className={`size-1.5 rounded-full ${i === active ? 'animate-pulse bg-signal' : i < active ? 'bg-muted-foreground' : 'bg-muted'}`} aria-hidden />
          {step}
        </li>
      ))}
    </ol>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="flex w-full items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-left text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <span>{message}</span>
    </div>
  )
}
