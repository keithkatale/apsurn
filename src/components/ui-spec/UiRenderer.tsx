"use client";

import { useMemo, useState, type ReactNode } from "react";
import { evaluate } from "@/lib/ui/expr";
import type { Accent, UiBlock } from "@/lib/ui/spec";
import { cn } from "@/lib/cn";
import { Markdown } from "./Markdown";

type Values = Record<string, string | number | boolean>;

const SOFT: Record<Accent, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  blue: "bg-[#E8F1FC] text-[#4379EE]",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  purple: "bg-violet-50 text-violet-700",
};

const SOLID: Record<Accent, string> = {
  neutral: "bg-neutral-500",
  blue: "bg-[#4379EE]",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  purple: "bg-violet-500",
};

const CALLOUT: Record<string, string> = {
  info: "border-[#CFE2FC] bg-[#E8F1FC] text-neutral-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

const field =
  "w-full rounded-lg bg-neutral-100 px-3 py-2 text-[13.5px] text-neutral-900 outline-none ring-0 placeholder:text-neutral-400 focus:bg-neutral-50 focus:ring-1 focus:ring-[#4379EE]";

function collectDefaults(blocks: UiBlock[], out: Values) {
  for (const block of blocks) {
    if (block.type === "select" || block.type === "input") out[block.id] = block.value;
    else if (block.type === "toggle") out[block.id] = block.value;
    else if (block.type === "slider") out[block.id] = block.value;
    else if (block.type === "tabs") block.items.forEach((i) => collectDefaults(i.blocks, out));
    else if (block.type === "accordion") block.items.forEach((i) => collectDefaults(i.blocks, out));
  }
}

function numericVars(values: Values): Record<string, number> {
  const vars: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "number") vars[key] = value;
    else if (typeof value === "boolean") vars[key] = value ? 1 : 0;
    else if (value.trim() !== "" && Number.isFinite(Number(value))) vars[key] = Number(value);
    else if (value.trim() === "") vars[key] = 0;
  }
  return vars;
}

function formatMetric(value: number, format: "number" | "currency" | "percent", prefix?: string, suffix?: string) {
  if (!Number.isFinite(value)) return "—";
  let body: string;
  if (format === "currency") body = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  else if (format === "percent") body = `${Math.round(value * 10) / 10}%`;
  else body = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  return `${format === "currency" ? "" : (prefix ?? "")}${body}${suffix ?? ""}`;
}

function Chip({ tone, children }: { tone: Accent; children: ReactNode }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium", SOFT[tone])}>{children}</span>;
}

function Tabs({ items, render }: { items: Array<{ label: string; blocks: UiBlock[] }>; render: (b: UiBlock[]) => ReactNode }) {
  const [active, setActive] = useState(0);
  const current = items[Math.min(active, items.length - 1)];
  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-neutral-200">
        {items.map((item, i) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px]",
              i === active ? "border-[#4379EE] font-semibold text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{render(current.blocks)}</div>
    </div>
  );
}

function BlockList({
  blocks,
  values,
  setValue,
  onPrompt,
}: {
  blocks: UiBlock[];
  values: Values;
  setValue: (id: string, value: string | number | boolean) => void;
  onPrompt?: (text: string) => void;
}) {
  const vars = useMemo(() => numericVars(values), [values]);
  const inner = (nested: UiBlock[]) => <BlockList blocks={nested} values={values} setValue={setValue} onPrompt={onPrompt} />;

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.when && String(values[block.when.id]) !== block.when.equals) return null;
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case "hero":
            return (
              <section key={key} className="rounded-2xl bg-neutral-50 px-6 py-10 text-center">
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">{block.title}</h1>
                {block.subtitle ? <p className="mx-auto mt-3 max-w-xl text-[15px] text-neutral-600">{block.subtitle}</p> : null}
                {block.cta ? (
                  <a href={block.cta.href} className="mt-5 inline-flex rounded-full bg-[#4379EE] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#3567D6]">
                    {block.cta.label}
                  </a>
                ) : null}
              </section>
            );
          case "heading": {
            const size = block.level === 1 ? "text-2xl" : block.level === 3 ? "text-[15px]" : "text-lg";
            return (
              <h2 key={key} className={cn("font-heading font-semibold tracking-tight text-neutral-900", size)}>
                {block.text}
              </h2>
            );
          }
          case "text":
            return <Markdown key={key}>{block.markdown}</Markdown>;
          case "stats":
            return (
              <dl key={key} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {block.items.map((item) => (
                  <div key={item.label} className={cn("rounded-xl px-3 py-3", SOFT[item.tone ?? "neutral"])}>
                    <dd className="text-xl font-semibold tabular-nums">{item.value}</dd>
                    <dt className="text-[12px] opacity-80">{item.label}</dt>
                    {item.hint ? <p className="mt-0.5 text-[11px] opacity-60">{item.hint}</p> : null}
                  </div>
                ))}
              </dl>
            );
          case "table":
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-neutral-200">
                {block.caption ? <p className="px-3 pt-2.5 text-[12px] font-medium text-neutral-500">{block.caption}</p> : null}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr className={cn("text-[11px] uppercase tracking-wide", block.accent === "neutral" ? "border-b border-neutral-200 text-neutral-400" : SOFT[block.accent])}>
                        {block.columns.map((c) => (
                          <th key={c.key} className="px-3 py-2 font-semibold">
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, r) => (
                        <tr key={r} className={cn("border-b border-neutral-100 last:border-b-0", block.striped && r % 2 === 1 && "bg-neutral-50")}>
                          {block.columns.map((c) => {
                            const cell = row[c.key];
                            return (
                              <td key={c.key} className="max-w-[280px] px-3 py-2 text-neutral-800">
                                {!cell?.text ? (
                                  <span className="text-neutral-300">—</span>
                                ) : cell.tone ? (
                                  <Chip tone={cell.tone}>{cell.text}</Chip>
                                ) : (
                                  <span className="block truncate" title={cell.text}>
                                    {cell.text}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          case "cards":
            return (
              <div
                key={key}
                className={cn("grid gap-3", block.columns === 1 ? "grid-cols-1" : block.columns === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}
              >
                {block.items.map((item, i) => {
                  const body = (
                    <>
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image} alt="" loading="lazy" className="mb-3 h-32 w-full rounded-lg object-cover" />
                      ) : null}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {item.logoDomain ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(item.logoDomain)}`}
                              alt=""
                              className="size-6 shrink-0 rounded"
                            />
                          ) : null}
                          <h3 className="truncate text-[14px] font-semibold text-neutral-900">{item.title}</h3>
                        </div>
                        {item.badge ? <Chip tone={item.badgeTone ?? "blue"}>{item.badge}</Chip> : null}
                      </div>
                      {item.subtitle ? <p className="mt-0.5 text-[12px] text-neutral-500">{item.subtitle}</p> : null}
                      {item.body ? <p className="mt-2 text-[13px] leading-snug text-neutral-600">{item.body}</p> : null}
                    </>
                  );
                  const cls = "block rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-[#4379EE]/50";
                  return item.href ? (
                    <a key={i} href={item.href} className={cls} {...(/^https?:|^mailto:/i.test(item.href) ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
                      {body}
                    </a>
                  ) : (
                    <div key={i} className={cls}>
                      {body}
                    </div>
                  );
                })}
              </div>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={key} className={cn("ml-5 space-y-1 text-[14px] text-neutral-700", block.ordered ? "list-decimal" : "list-disc")}>
                {block.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </Tag>
            );
          }
          case "steps":
            return (
              <ol key={key} className="space-y-3">
                {block.items.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#E8F1FC] text-[12px] font-semibold text-[#4379EE]">{i + 1}</span>
                    <div>
                      <p className="text-[14px] font-medium text-neutral-900">{item.title}</p>
                      {item.body ? <p className="text-[13px] text-neutral-600">{item.body}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            );
          case "key_values":
            return (
              <dl key={key} className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-[10rem_1fr]">
                {block.items.map((item) => (
                  <div key={item.label} className="contents">
                    <dt className="text-neutral-500">{item.label}</dt>
                    <dd className="text-neutral-900">{item.value}</dd>
                  </div>
                ))}
              </dl>
            );
          case "callout":
            return (
              <div key={key} className={cn("rounded-xl border px-4 py-3 text-[13.5px]", CALLOUT[block.tone])}>
                {block.title ? <p className="font-semibold">{block.title}</p> : null}
                <p className={block.title ? "mt-0.5" : ""}>{block.text}</p>
              </div>
            );
          case "badges":
            return (
              <div key={key} className="flex flex-wrap gap-1.5">
                {block.items.map((item) => (
                  <Chip key={item.text} tone={item.tone}>
                    {item.text}
                  </Chip>
                ))}
              </div>
            );
          case "progress":
            return (
              <div key={key}>
                <div className="flex justify-between text-[12px] text-neutral-600">
                  <span>{block.label}</span>
                  <span className="tabular-nums">{Math.round(block.value)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className={cn("h-full rounded-full", SOLID[block.tone])} style={{ width: `${block.value}%` }} />
                </div>
              </div>
            );
          case "quote":
            return (
              <blockquote key={key} className="border-l-2 border-[#4379EE] pl-4">
                <p className="text-[15px] italic text-neutral-800">{block.text}</p>
                {block.by ? <footer className="mt-1 text-[12px] text-neutral-500">{block.by}</footer> : null}
              </blockquote>
            );
          case "image":
            return (
              <figure key={key}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={block.src} alt={block.alt} loading="lazy" className="max-h-96 w-full rounded-xl object-cover" />
                {block.caption ? <figcaption className="mt-1.5 text-center text-[12px] text-neutral-500">{block.caption}</figcaption> : null}
              </figure>
            );
          case "gallery":
            return (
              <div key={key} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {block.items.map((item, i) => (
                  <figure key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.src} alt={item.alt} loading="lazy" className="h-36 w-full rounded-lg object-cover" />
                    {item.caption ? <figcaption className="mt-1 text-[11.5px] text-neutral-500">{item.caption}</figcaption> : null}
                  </figure>
                ))}
              </div>
            );
          case "buttons": {
            const items = block.items.filter((i) => i.action === "link" || onPrompt);
            if (!items.length) return null;
            return (
              <div key={key} className="flex flex-wrap gap-2">
                {items.map((item) =>
                  item.action === "link" ? (
                    <a
                      key={item.label}
                      href={item.href}
                      {...(/^https?:|^mailto:/i.test(item.href ?? "") ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                      className="rounded-full bg-[#4379EE] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#3567D6]"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onPrompt?.(item.text ?? item.label)}
                      className="rounded-full bg-neutral-100 px-4 py-2 text-[13px] font-medium text-neutral-800 hover:bg-neutral-200/80"
                    >
                      {item.label}
                    </button>
                  ),
                )}
              </div>
            );
          }
          case "divider":
            return <hr key={key} className="border-neutral-200" />;

          case "tabs":
            return <Tabs key={key} items={block.items} render={inner} />;
          case "accordion":
            return (
              <div key={key} className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
                {block.items.map((item, i) => (
                  <details key={i} className="group px-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[14px] font-medium text-neutral-900 [&::-webkit-details-marker]:hidden">
                      {item.title}
                      <span className="text-neutral-400 transition-transform group-open:rotate-90" aria-hidden>
                        ›
                      </span>
                    </summary>
                    <div className="pb-4">{inner(item.blocks)}</div>
                  </details>
                ))}
              </div>
            );
          case "select":
            return (
              <label key={key} className="block max-w-sm">
                <span className="mb-1 block text-[12px] font-medium text-neutral-500">{block.label}</span>
                <select value={String(values[block.id] ?? block.value)} onChange={(e) => setValue(block.id, e.target.value)} className={field}>
                  {block.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          case "toggle": {
            const on = Boolean(values[block.id]);
            return (
              <button key={key} type="button" role="switch" aria-checked={on} onClick={() => setValue(block.id, !on)} className="flex items-center gap-2.5 text-[13.5px] text-neutral-800">
                <span className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-[#4379EE]" : "bg-neutral-300")}>
                  <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
                </span>
                {block.label}
              </button>
            );
          }
          case "input":
            return (
              <label key={key} className="block max-w-sm">
                <span className="mb-1 block text-[12px] font-medium text-neutral-500">{block.label}</span>
                <input
                  type={block.inputType}
                  value={String(values[block.id] ?? "")}
                  placeholder={block.placeholder}
                  onChange={(e) => setValue(block.id, e.target.value)}
                  className={field}
                />
              </label>
            );
          case "slider":
            return (
              <label key={key} className="block max-w-md">
                <span className="mb-1 flex justify-between text-[12px] font-medium text-neutral-500">
                  {block.label}
                  <span className="tabular-nums text-neutral-900">{Number(values[block.id] ?? block.value)}</span>
                </span>
                <input
                  type="range"
                  min={block.min}
                  max={block.max}
                  step={block.step}
                  value={Number(values[block.id] ?? block.value)}
                  onChange={(e) => setValue(block.id, Number(e.target.value))}
                  className="w-full accent-[#4379EE]"
                />
              </label>
            );
          case "metric": {
            const result = evaluate(block.formula, vars);
            return (
              <div key={key} className="rounded-xl bg-neutral-50 px-4 py-3">
                <p className="text-[12px] text-neutral-500">{block.label}</p>
                <p className="text-2xl font-semibold tabular-nums text-neutral-900">{formatMetric(result, block.format, block.prefix, block.suffix)}</p>
                {block.hint ? <p className="text-[11.5px] text-neutral-400">{block.hint}</p> : null}
              </div>
            );
          }
        }
      })}
    </div>
  );
}

/**
 * Renders a validated block list with live state for its dropdowns, toggles, sliders and calculators.
 * The same component powers in-chat widgets, the Library preview and public pages.
 * "prompt" buttons only appear when a handler is given.
 */
export function UiRenderer({ blocks, onPrompt, className }: { blocks: UiBlock[]; onPrompt?: (text: string) => void; className?: string }) {
  const [overrides, setOverrides] = useState<Values>({});
  const values = useMemo(() => {
    const defaults: Values = {};
    collectDefaults(blocks, defaults);
    return { ...defaults, ...overrides };
  }, [blocks, overrides]);

  return (
    <div className={className}>
      <BlockList blocks={blocks} values={values} setValue={(id, value) => setOverrides((prev) => ({ ...prev, [id]: value }))} onPrompt={onPrompt} />
    </div>
  );
}
