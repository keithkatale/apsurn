export function SetupNotice() {
  return (
    <div className="rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-[var(--mh-fg)]">
      Analytics storage is not set up yet. Run <code>supabase/migrations/0006_events.sql</code> in the Supabase SQL editor,
      then reload. User and billing numbers that do not depend on it still show below.
    </div>
  )
}
