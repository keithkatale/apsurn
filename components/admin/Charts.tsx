// Small dependency-free SVG charts for the admin dashboard. Colours follow the theme tokens.

type Point = { label: string; value: number }

const axis = 'var(--mh-muted)'

/** Filled line chart with the first/last dates and the peak labelled. */
export function AreaChart({ points, color = 'var(--mh-fg)', height = 120 }: { points: Point[]; color?: string; height?: number }) {
  const w = 600
  const pad = { t: 8, r: 6, b: 18, l: 6 }
  const max = Math.max(1, ...points.map((p) => p.value))
  const n = Math.max(points.length - 1, 1)
  const x = (i: number) => pad.l + (i / n) * (w - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad.b} L${x(0).toFixed(1)},${height - pad.b} Z`
  const peak = points.reduce((m, p, i) => (p.value > points[m].value ? i : m), 0)
  if (!points.length) return <p className="py-8 text-center text-xs text-[var(--mh-muted)]">No data yet</p>
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label="Trend chart">
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {points[peak].value > 0 && (
        <g>
          <circle cx={x(peak)} cy={y(points[peak].value)} r={3} fill={color} />
          <text x={Math.min(Math.max(x(peak), 24), w - 24)} y={Math.max(y(points[peak].value) - 6, 10)} textAnchor="middle" fontSize={11} fill={color}>
            {points[peak].value}
          </text>
        </g>
      )}
      <text x={pad.l} y={height - 4} fontSize={10} fill={axis}>
        {points[0].label}
      </text>
      <text x={w - pad.r} y={height - 4} fontSize={10} fill={axis} textAnchor="end">
        {points[points.length - 1].label}
      </text>
    </svg>
  )
}

/** Vertical bars, one per point. */
export function BarChart({ points, color = 'var(--mh-fg)', height = 120 }: { points: Point[]; color?: string; height?: number }) {
  const w = 600
  const pad = { t: 8, b: 18 }
  const max = Math.max(1, ...points.map((p) => p.value))
  if (!points.length) return <p className="py-8 text-center text-xs text-[var(--mh-muted)]">No data yet</p>
  const slot = w / points.length
  const barW = Math.max(2, slot * 0.7)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label="Bar chart">
      {points.map((p, i) => {
        const h = (p.value / max) * (height - pad.t - pad.b)
        return (
          <rect key={`${p.label}-${i}`} x={i * slot + (slot - barW) / 2} y={height - pad.b - h} width={barW} height={Math.max(h, p.value > 0 ? 1 : 0)} rx={1.5} fill={color} opacity={0.85}>
            <title>{`${p.label}: ${p.value}`}</title>
          </rect>
        )
      })}
      <text x={0} y={height - 4} fontSize={10} fill={axis}>
        {points[0].label}
      </text>
      <text x={w} y={height - 4} fontSize={10} fill={axis} textAnchor="end">
        {points[points.length - 1].label}
      </text>
    </svg>
  )
}

/** Horizontal funnel: each step as a bar sized against the first step, with the drop-off from the previous one. */
export function FunnelBars({ steps }: { steps: { step: string; actors: number }[] }) {
  const top = Math.max(1, steps[0]?.actors ?? 1)
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((s, i) => {
        const pct = Math.round((s.actors / top) * 100)
        const prev = i > 0 ? steps[i - 1].actors : null
        const step = prev && prev > 0 ? Math.round((s.actors / prev) * 100) : null
        return (
          <li key={s.step} className="grid grid-cols-[9.5rem_1fr_auto] items-center gap-3 text-xs">
            <span className="text-[var(--mh-fg)]">{s.step}</span>
            <span className="h-5 overflow-hidden rounded-[5px] bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)]">
              <span className="block h-full rounded-[5px] bg-[var(--mh-fg)] opacity-80" style={{ width: `${Math.max(pct, s.actors > 0 ? 2 : 0)}%` }} />
            </span>
            <span className="min-w-[7rem] text-right font-mono text-[var(--mh-muted)]">
              {s.actors.toLocaleString()}
              {step !== null && <span className="ml-2">({step}% of prev)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Ranked horizontal bars for "top pages", "top referrers" and similar lists. */
export function RankBars({ rows, empty = 'Nothing yet' }: { rows: { label: string; value: number; sub?: string }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="py-6 text-center text-xs text-[var(--mh-muted)]">{empty}</p>
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="relative overflow-hidden rounded-[6px] px-2.5 py-1.5 text-xs">
          <span className="absolute inset-y-0 left-0 bg-[color:color-mix(in_srgb,var(--mh-fg)_9%,transparent)]" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
          <span className="relative flex items-center justify-between gap-3">
            <span className="truncate text-[var(--mh-fg)]" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 font-mono text-[var(--mh-muted)]">
              {r.value.toLocaleString()}
              {r.sub ? ` · ${r.sub}` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
