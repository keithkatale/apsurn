import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface PreviewRow {
  key: string;
  left: ReactNode;
  right: ReactNode;
}

export function CardPin({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

/**
 * A card with a small bordered table at the top that slides out on hover, and the name at the bottom over a soft blur.
 * Used for prospect lists and campaigns. Styles live in globals.css (.list-card).
 */
export function PreviewTableCard({
  title,
  meta,
  pin,
  headers,
  rows,
  emptyText = "Nothing here yet",
  onOpen,
}: {
  title: string;
  meta: string;
  pin: { icon: LucideIcon; label: string };
  headers: [string, string];
  rows: PreviewRow[];
  emptyText?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="list-card group relative flex h-[260px] flex-col overflow-hidden rounded-[10px] text-left transition-colors hover:border-neutral-400"
    >
      <div className="min-h-0 flex-1 overflow-hidden px-4 pt-4">
        {rows.length === 0 ? (
          <p className="pt-8 text-center text-[12px] text-neutral-400">{emptyText}</p>
        ) : (
          <div className="list-card-preview overflow-hidden rounded-[6px]">
            <table className="w-full table-fixed border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[var(--lc-line)] text-left text-[10px] uppercase tracking-wide text-neutral-400">
                  <th className="border-r border-[var(--lc-line)] px-2.5 py-1.5 font-medium">{headers[0]}</th>
                  <th className="px-2.5 py-1.5 font-medium">{headers[1]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-[var(--lc-line)] last:border-b-0">
                    <td className="border-r border-[var(--lc-line)] px-2.5 py-2">{row.left}</td>
                    <td className="px-2.5 py-2">{row.right}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="list-card-fade pointer-events-none absolute inset-x-0 bottom-0 h-28" aria-hidden />
      <div className="relative z-10 flex items-end justify-between gap-2 px-4 pb-3.5 pt-7">
        <span className="list-card-bar pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-neutral-900">{title}</p>
          <p className="mt-0.5 truncate text-[12px] text-neutral-500">{meta}</p>
        </div>
        <CardPin {...pin} />
      </div>
    </button>
  );
}
